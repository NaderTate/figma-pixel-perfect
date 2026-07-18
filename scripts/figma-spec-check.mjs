#!/usr/bin/env node
// figma-spec-check: the Figma spec as a TEST SUITE. The agent extracts the
// design's geometry + key styles from get_metadata / get_design_context into
// spec.json, then builds until this script passes. Failures name the exact
// element and property that is off, with the delta, so fixing is mechanical.
//
// Usage: node scripts/figma-spec-check.mjs <spec.json> [more-spec.json ...]
//        [--url <override>] [--width <override>]
// Deps:  npm i -D playwright && npx playwright install chromium
//
// Spec format (coordinates are relative to the section root's top-left,
// exactly like Figma metadata coordinates are relative to the queried frame):
// {
//   "url": "http://localhost:3000",
//   "viewportWidth": 1440,
//   "tolerancePx": 1,
//   "sections": [{
//     "name": "hero",
//     "root": "[data-figma='hero']",
//     "box": { "width": 1440, "height": 720 },          // optional, page coords
//     "elements": [{
//       "name": "title",
//       "selector": "[data-figma='hero-title']",
//       "box": { "x": 120, "y": 96, "width": 560, "height": 116 },
//       "styles": { "fontSize": "48px", "fontWeight": "600", "color": "#101828" }
//     }]
//   }]
// }
// Every key in "box" / "styles" is optional; only what you assert is checked.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// ---------- args ----------
const args = process.argv.slice(2);
const files = [];
let urlOverride = null;
let widthOverride = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url") urlOverride = args[++i];
  else if (args[i] === "--width") widthOverride = Number.parseInt(args[++i], 10);
  else files.push(args[i]);
}
if (files.length === 0) {
  console.error("usage: node scripts/figma-spec-check.mjs <spec.json> [...] [--url u] [--width w]");
  process.exit(2);
}

// ---------- load + merge specs ----------
let url = urlOverride;
let viewportWidth = widthOverride;
let tolerancePx = null;
const sections = [];
for (const f of files) {
  const spec = JSON.parse(readFileSync(f, "utf8"));
  if (!url && spec.url) url = spec.url;
  if (!viewportWidth && spec.viewportWidth) viewportWidth = spec.viewportWidth;
  if (tolerancePx == null && spec.tolerancePx != null) tolerancePx = spec.tolerancePx;
  for (const s of spec.sections || []) sections.push(s);
}
if (!url || !viewportWidth || sections.length === 0) {
  console.error("spec needs url, viewportWidth, and at least one section");
  process.exit(2);
}
if (tolerancePx == null) tolerancePx = 1;

// ---------- value normalization ----------
const WEIGHTS = { normal: "400", bold: "700" };
const kebab = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

function parseColor(v) {
  v = String(v).trim().toLowerCase();
  if (v.startsWith("#")) {
    let h = v.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  return null;
}

// Returns null if equal (within tolerance), else a human-readable delta note.
function compareValue(prop, expected, actual) {
  let e = String(expected).trim();
  let a = String(actual).trim();
  if (prop === "font-weight") {
    e = WEIGHTS[e.toLowerCase()] || e;
    a = WEIGHTS[a.toLowerCase()] || a;
  }
  const ec = parseColor(e);
  if (ec) {
    const ac = parseColor(a);
    if (!ac) return `expected color ${e}, got "${a}"`;
    const off =
      Math.abs(ec.r - ac.r) > 1 ||
      Math.abs(ec.g - ac.g) > 1 ||
      Math.abs(ec.b - ac.b) > 1 ||
      Math.abs(ec.a - ac.a) > 0.02;
    return off ? `expected ${e}, got ${a}` : null;
  }
  const px = /^-?[\d.]+px$/;
  if (px.test(e) && px.test(a)) {
    const d = parseFloat(a) - parseFloat(e);
    return Math.abs(d) > tolerancePx ? `expected ${e}, got ${a} (delta ${d > 0 ? "+" : ""}${d.toFixed(1)})` : null;
  }
  const num = /^-?[\d.]+$/;
  if (num.test(e) && num.test(a)) {
    return Math.abs(parseFloat(a) - parseFloat(e)) > 0.011 ? `expected ${e}, got ${a}` : null;
  }
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").replace(/"\s*/g, '"');
  return norm(e) === norm(a) ? null : `expected "${e}", got "${a}"`;
}

// ---------- measure in the real browser ----------
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: 900 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready); // measure with the real font, not the fallback
await page.waitForTimeout(300);

const measured = await page.evaluate((sections) => {
  return sections.map((s) => {
    const root = document.querySelector(s.root);
    if (!root) return { rootMissing: true };
    const rr = root.getBoundingClientRect();
    const rootBox = {
      x: rr.left + window.scrollX,
      y: rr.top + window.scrollY,
      width: rr.width,
      height: rr.height,
    };
    const elements = (s.elements || []).map((el) => {
      const target = root.querySelector(el.selector) || document.querySelector(el.selector);
      if (!target) return { missing: true };
      const matches = root.querySelectorAll(el.selector).length;
      const r = target.getBoundingClientRect();
      const cs = getComputedStyle(target);
      const styles = {};
      for (const key of Object.keys(el.styles || {})) {
        const k = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        styles[key] = cs.getPropertyValue(k);
      }
      return {
        matches,
        box: { x: r.left - rr.left, y: r.top - rr.top, width: r.width, height: r.height },
        styles,
      };
    });
    return { rootBox, elements };
  });
}, sections);
await browser.close();

// ---------- compare + report ----------
let checks = 0;
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};

console.log(`spec-check: ${url} @ ${viewportWidth}px  (tolerance ${tolerancePx}px)`);
for (let i = 0; i < sections.length; i++) {
  const spec = sections[i];
  const m = measured[i];
  console.log(`\n[${spec.name || spec.root}]`);
  if (m.rootMissing) {
    checks++;
    fail(`root not found: ${spec.root}`);
    continue;
  }
  for (const [k, v] of Object.entries(spec.box || {})) {
    checks++;
    const d = m.rootBox[k] - v;
    if (Math.abs(d) > tolerancePx) fail(`root box.${k}: expected ${v}, got ${m.rootBox[k].toFixed(1)} (delta ${d > 0 ? "+" : ""}${d.toFixed(1)})`);
  }
  for (let j = 0; j < (spec.elements || []).length; j++) {
    const el = spec.elements[j];
    const me = m.elements[j];
    const label = el.name || el.selector;
    if (me.missing) {
      checks++;
      fail(`${label}: selector not found: ${el.selector}`);
      continue;
    }
    if (me.matches > 1) console.log(`  note ${label}: selector matches ${me.matches} elements, using first`);
    let elFails = 0;
    for (const [k, v] of Object.entries(el.box || {})) {
      checks++;
      const d = me.box[k] - v;
      if (Math.abs(d) > tolerancePx) {
        fail(`${label} box.${k}: expected ${v}, got ${me.box[k].toFixed(1)} (delta ${d > 0 ? "+" : ""}${d.toFixed(1)})`);
        elFails++;
      }
    }
    for (const [k, v] of Object.entries(el.styles || {})) {
      checks++;
      const note = compareValue(kebab(k), v, me.styles[k]);
      if (note) {
        fail(`${label} ${kebab(k)}: ${note}`);
        elFails++;
      }
    }
    if (elFails === 0) console.log(`  ok   ${label}`);
  }
}

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
