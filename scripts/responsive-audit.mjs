#!/usr/bin/env node
// responsive-audit: load a URL across the full viewport matrix and assert the
// layout is FLEXIBLE and robust at every width. Three hard checks per width:
//   1. No horizontal scroll.
//   2. Full-bleed: every top-level section band spans the viewport width.
//      A page built as a fixed canvas (e.g. everything anchored to 1440px)
//      fails this instantly at wider viewports. The Figma frame width is a
//      verification width, never a CSS constant.
//   3. Centered: when a section's content is narrower than the viewport, its
//      content block must be horizontally centered (no dead space on one side).
// Screenshots each width (full page) into <outDir> for visual review by an
// agent that LOOKS - overlap, clipping, ugly reflow are invisible to scripts.
//
// Sections are found via [data-figma] roots (the build tags them); falls back
// to direct children of <body> taller than 150px.
//
// Usage: node scripts/responsive-audit.mjs <url> [outDir]
// Deps:  npm i -D playwright && npx playwright install chromium

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.argv[2] || "http://localhost:3000/";
const OUT = process.argv[3] || ".audit";
// tiny phone -> stadium monitor
const WIDTHS = [320, 360, 393, 414, 480, 640, 768, 1024, 1280, 1440, 1920, 2560, 3840];
const CENTER_TOL = 32; // px a boxed content block may be off viewport-center
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
let fails = 0;

console.log(`auditing ${URL}`);
console.log("width   result   docScrollW   issues");
console.log("-".repeat(78));

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(URL, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const r = await page.evaluate(
    ({ vw, centerTol }) => {
      const docSW = document.documentElement.scrollWidth;
      // 1. overflow offenders (horizontal scroll cause)
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute("class") || "").slice(0, 36),
            right: Math.round(rect.right),
          });
        }
      }
      offenders.sort((a, b) => b.right - a.right);

      // top-level sections: outermost [data-figma] roots, else big body children
      let sections = [...document.querySelectorAll("[data-figma]")].filter((el) => {
        const p = el.parentElement && el.parentElement.closest("[data-figma]");
        return !p && el.getBoundingClientRect().height >= 150;
      });
      if (sections.length === 0) {
        sections = [...document.body.children].filter(
          (el) => el.getBoundingClientRect().height >= 150
        );
      }

      // 2. full-bleed + 3. centered-content checks
      const notFullBleed = [];
      const offCenter = [];
      for (const s of sections) {
        const name = s.getAttribute("data-figma") || s.tagName.toLowerCase();
        const sr = s.getBoundingClientRect();
        if (sr.width < vw - 4) notFullBleed.push(`${name}(${Math.round(sr.width)}w)`);
        let minL = Infinity;
        let maxR = -Infinity;
        for (const c of s.children) {
          const rc = c.getBoundingClientRect();
          if (rc.width === 0 || rc.height === 0) continue;
          minL = Math.min(minL, rc.left);
          maxR = Math.max(maxR, rc.right);
        }
        if (Number.isFinite(minL) && maxR - minL < vw - 8) {
          const off = Math.round(Math.abs((minL + maxR) / 2 - vw / 2));
          if (off > centerTol) offCenter.push(`${name}(+${off}px)`);
        }
      }
      return {
        docSW,
        hScroll: docSW > vw + 1,
        worst: offenders[0] || null,
        notFullBleed,
        offCenter,
        sectionCount: sections.length,
      };
    },
    { vw: w, centerTol: CENTER_TOL }
  );

  const issues = [];
  if (r.hScroll)
    issues.push(`h-scroll(${r.docSW}) worst:${r.worst ? `${r.worst.tag}.${r.worst.cls}@${r.worst.right}` : "-"}`);
  if (r.notFullBleed.length) issues.push(`not-full-bleed: ${r.notFullBleed.join(" ")}`);
  if (r.offCenter.length) issues.push(`off-center: ${r.offCenter.join(" ")}`);
  const flag = issues.length ? "FAIL" : "ok";
  if (issues.length) fails++;
  console.log(
    `${String(w).padEnd(7)} ${flag.padEnd(8)} ${String(r.docSW).padEnd(12)} ${issues.join("  |  ") || "-"}`
  );
  await page.screenshot({ path: `${OUT}/w-${String(w).padStart(4, "0")}.png`, fullPage: true });
}

await browser.close();
console.log("-".repeat(78));
console.log(
  fails === 0
    ? "PASS: flexible at every width (no h-scroll, sections full-bleed, content centered). Now LOOK at the screenshots - scripts cannot judge reflow quality."
    : `FAIL: layout problems at ${fails} width(s). A fixed-canvas build (page hard-sized to the Figma frame width) is the classic cause of not-full-bleed/off-center failures.`
);
process.exit(fails ? 1 : 0);
