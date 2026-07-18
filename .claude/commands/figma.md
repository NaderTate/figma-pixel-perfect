---
description: Convert a Figma frame/section into pixel-perfect code in this repo's stack, verified by a spec test suite + screenshot diff (never by eye).
argument-hint: <figma-node-url> [target-file]
---

# /figma - Figma to pixel-perfect code

Turn the Figma node at `$ARGUMENTS` into production code in THIS repo's stack, verified objectively. The full methodology lives in `FIGMA_PIXEL_PERFECT.md`; read it once per session. Speed comes from never rediscovering the workflow and never rabbit-holing on a mask.

## 0. Setup (once per repo, skip if already done)

- Detect the stack from `package.json` and build in it.
- Ensure verify deps: `npm i -D playwright pixelmatch pngjs && npx playwright install chromium`. Add `.figma/` and `.audit/` to `.gitignore`.
- Run `get_variable_defs` on the top frame and map tokens into the theme (Tailwind `@theme` / theme config) ONCE. Reuse named tokens everywhere after; never re-hardcode a hex that has a token.

## 1. Read the node - always, in this order

1. `get_metadata(node)` - structure + exact x/y/w/h. **This is the source of truth for geometry.** Read the frame's own width here; never assume 1440.
2. `get_variable_defs(node)` - colors, type, spacing tokens.
3. `get_screenshot(node)` - save the reference PNG to `.figma/<name>/reference.png`.
4. `get_design_context(node)` - reference code + asset download URLs. **A hint, not gospel** (see build rule 1).

## 2. Triage - section or page?

- **Full page** (node has several top-level section children): set up tokens + the page shell + globals FIRST (in this session, not in parallel), then dispatch **one `figma-section-builder` subagent per section, in parallel**. Each owns ONE component file and writes its own spec file. This is where speed scales: a page costs about the slowest section, not the sum.
- **Single section/component:** build it directly here.

## 3. Build rules (the ones that cost time when ignored)

1. **Geometry from `get_metadata`, not `get_design_context`.** The Figma code wraps layers in `display:contents`, which collapses real offsets, so its positions are often wrong. Cross-check every position against metadata (its x/y are flat coords within the queried frame).
2. **Exact values + real fonts.** `text-[72px]`, token hexes, the actual font actually loaded. A wrong font invalidates every other measurement.
3. **ASSET-EXPORT RULE (the #1 time saver).** Any organic/multi-layer mask, clipped photo, gradient mesh, or decorative vector composite: export that node as ONE png/svg and place it at its metadata coords. Do NOT hand-rebuild CSS `mask-image` composites. Budget: at most ONE attempt at a DOM/SVG clip; if it is not matching, export the node and move on.
4. **Reuse components.** Use the Code Connect map / the repo's library. Never rebuild a Button that already exists.
5. **Tag as you build.** Put `data-figma="<slug>"` on each section root and on the key elements you will assert in the spec (headings, buttons, columns, fixed-width containers). Stable selectors make the spec suite trivial.

## 4. Spec-as-tests (write the test before polishing)

Turn the design data into a failing test suite, then build until it is green:

1. From `get_metadata` (+ type/colors from `get_design_context`), write `.figma/<name>/spec.json`: the section root selector, then 8-15 assertions for the elements that define the layout (container widths, column x-positions, gaps expressed as y/x coords, heading font-size/weight/color, fixed heights). Coordinates are relative to the section root, exactly like the metadata coords. Format documented at the top of `scripts/figma-spec-check.mjs`.
2. Run `node scripts/figma-spec-check.mjs .figma/<name>/spec.json` (accepts several spec files at once for multi-section pages).
3. Every failure names the element, property, expected, actual, delta. Fix from the data, re-run, repeat until `0 failed`.

The spec catches what the eye misses (a 4px drift, a 500-vs-600 weight) and pins it to the exact element. The pixel diff below catches what the spec misses (fonts rendering, assets, masks). You need both.

## 5. Verify - objective loop, never eyeball-only

1. Serve the app. `node scripts/figma-shot.mjs <url> <frameWidth> .figma/<name>/render.png "<root-selector>"` (the selector crops the shot to the section, matching the reference).
2. `node scripts/figma-diff.mjs .figma/<name>/reference.png .figma/<name>/render.png .figma/<name>` gives the mismatch % + a worst-cell grid + `diff.png`.
3. LOOK at `diff.png` and the two images side by side, localize with the grid, fix from the data, iterate until **sub-perceptual (< ~3%)**. Tip: if a small shift fixes it, it is a position bug; if no shift helps, it is shape/scale, so export the asset.
4. **OFF-FRAME RULE - the definition of done.** Pixel-perfect is required ONLY at each frame's own width (read `width` from `get_metadata` per frame, never hardcode it). At EVERY OTHER width the layout will and should differ; there the bar is "professional and robust," judged by an agent that LOOKS, not just a script: no horizontal scroll, no weird/empty white space, no overlap or clipping, intentional reflow. Run `node scripts/responsive-audit.mjs <url>` (320 to 3840), then open the screenshots in `.audit/` and review each; a `ui-reviewer`-style agent signs off if available. Build mobile from the mobile frame; never infer it.
5. Run the repo's own checks (build, lint, typecheck) before calling it done.

## 6. Report

- Spec suite: N checks, 0 failed (or list what remains and why).
- Final diff % per section at the frame width.
- Responsive: pass/fail per width + anything visually off.
- Paths written, assets exported, and any substitutions flagged (placeholder copy replaced, undesigned states added).

Never claim pixel-perfect without the numbers. "Matched to spec values, visual pass still needed" is the honest fallback when a step could not run.
