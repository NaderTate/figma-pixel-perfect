#!/usr/bin/env node
// responsive-audit: load a URL across the full viewport matrix and assert it is
// robust at every width: no horizontal scroll, and report any element that
// spills past the right edge (a likely overflow cause). Screenshots each width
// (full page) into <outDir> for visual review. Exits non-zero if any width scrolls.
//
// The screenshots are the point: an agent must LOOK at them (overlap, clipping,
// dead space, broken reflow are invisible to the scroll check).
//
// Usage: node scripts/responsive-audit.mjs <url> [outDir]
// Deps:  npm i -D playwright && npx playwright install chromium

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.argv[2] || "http://localhost:3000/";
const OUT = process.argv[3] || ".audit";
// tiny phone -> stadium monitor
const WIDTHS = [320, 360, 393, 414, 480, 640, 768, 1024, 1280, 1440, 1920, 2560, 3840];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
let fails = 0;

console.log(`auditing ${URL}`);
console.log("width   result   docScrollW   right-overflowers   worst offender");
console.log("-".repeat(78));

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(200);
  const r = await page.evaluate((vw) => {
    const docSW = document.documentElement.scrollWidth;
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
    return { docSW, hScroll: docSW > vw + 1, count: offenders.length, worst: offenders[0] || null };
  }, w);

  const flag = r.hScroll ? "FAIL" : "ok";
  if (r.hScroll) fails++;
  const worst = r.worst ? `${r.worst.tag}.${r.worst.cls}@${r.worst.right}` : "-";
  console.log(
    `${String(w).padEnd(7)} ${flag.padEnd(8)} ${String(r.docSW).padEnd(12)} ${String(r.count).padEnd(19)} ${worst}`
  );
  await page.screenshot({ path: `${OUT}/w-${String(w).padStart(4, "0")}.png`, fullPage: true });
}

await browser.close();
console.log("-".repeat(78));
console.log(
  fails === 0
    ? "PASS: no horizontal scroll at any width. (Right-overflowers inside overflow-hidden are intentional bleed, not scroll.)"
    : `FAIL: horizontal scroll at ${fails} width(s), fix those.`
);
process.exit(fails ? 1 : 0);
