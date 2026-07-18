#!/usr/bin/env node
// figma-shot: screenshot a served page at an EXACT viewport width, so the
// render can be diffed 1:1 against the Figma reference. Waits for fonts.
//
// Usage: node scripts/figma-shot.mjs <url> <width> <out.png> [css-selector]
//   - with a selector: screenshots just that element (use the section root)
//   - without:         screenshots the full page
// Deps:  npm i -D playwright && npx playwright install chromium

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const [url, widthArg, out, selector] = process.argv.slice(2);
const width = Number.parseInt(widthArg, 10);
if (!url || !out || !Number.isFinite(width)) {
  console.error("usage: node scripts/figma-shot.mjs <url> <width> <out.png> [css-selector]");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height: 900 },
  deviceScaleFactor: 1, // 1:1 with Figma's 1x export; keep both sides at 1x
});
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready); // a wrong font invalidates every measurement
await page.waitForTimeout(300);

if (selector) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) {
    console.error(`selector not found: ${selector}`);
    await browser.close();
    process.exit(1);
  }
  await loc.screenshot({ path: out });
} else {
  await page.screenshot({ path: out, fullPage: true });
}
await browser.close();

const png = PNG.sync.read(readFileSync(out));
console.log(`shot: ${out}  ${png.width}x${png.height}  (viewport ${width})`);
