#!/usr/bin/env node
// figma-diff: objective pixel diff between a Figma reference PNG and a render PNG.
// Usage: node scripts/figma-diff.mjs <reference.png> <render.png> [outDir]
// Deps:  npm i -D pixelmatch pngjs
//
// Prints overall mismatch %, a 4x4 grid to localize the worst regions, and
// writes <outDir>/diff.png (mismatching pixels highlighted). This is the
// verify step of the /figma loop: iterate until the % is sub-perceptual.

import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [refPath, renPath, outDir = "."] = process.argv.slice(2);
if (!refPath || !renPath) {
  console.error("usage: node scripts/figma-diff.mjs <reference.png> <render.png> [outDir]");
  process.exit(2);
}

const ref = PNG.sync.read(readFileSync(refPath));
const ren = PNG.sync.read(readFileSync(renPath));

if (ref.width !== ren.width || ref.height !== ren.height) {
  console.error(
    `SIZE MISMATCH: ref ${ref.width}x${ref.height} vs render ${ren.width}x${ren.height} ` +
      `(dw ${ren.width - ref.width}, dh ${ren.height - ref.height}).\n` +
      `A width mismatch means the shot was not taken at the frame width (re-run figma-shot). ` +
      `A height mismatch on a same-width shot is itself a finding: total section height is off, ` +
      `check paddings/gaps against get_metadata before diffing.`
  );
  process.exit(1);
}

const { width, height } = ref;
const diff = new PNG({ width, height });
const n = pixelmatch(ref.data, ren.data, diff.data, width, height, {
  threshold: 0.1, // perceptual (YIQ); lower = stricter
  includeAA: false,
});
const total = width * height;
const pct = (100 * n) / total;
writeFileSync(`${outDir}/diff.png`, PNG.sync.write(diff));

// 4x4 grid localization: count highlighted (red) pixels per cell.
const COLS = 4,
  ROWS = 4;
const cells = [];
for (let gy = 0; gy < ROWS; gy++) {
  for (let gx = 0; gx < COLS; gx++) {
    const x0 = Math.floor((gx * width) / COLS);
    const x1 = Math.floor(((gx + 1) * width) / COLS);
    const y0 = Math.floor((gy * height) / ROWS);
    const y1 = Math.floor(((gy + 1) * height) / ROWS);
    let c = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (width * y + x) << 2;
        // pixelmatch marks differences in red; alpha is opaque there.
        if (diff.data[i + 3] > 0 && diff.data[i] > diff.data[i + 1]) c++;
      }
    }
    cells.push({ gx, gy, pct: (100 * c) / ((x1 - x0) * (y1 - y0)) });
  }
}
cells.sort((a, b) => b.pct - a.pct);

console.log(`diff: ${pct.toFixed(2)}%  (${n}/${total} px)  ->  ${outDir}/diff.png`);
console.log("worst cells (col,row = pct):");
for (const c of cells.slice(0, 4)) {
  console.log(`  (${c.gx},${c.gy}) = ${c.pct.toFixed(1)}%`);
}
// Exit non-zero if clearly off, so it can gate an agent loop or CI.
process.exit(pct > 5 ? 3 : 0);
