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
- **Cross-section decorations belong to the shell.** Scan the metadata for elements whose geometry spans more than one section: continuous lines/pipes whose x positions repeat across sections, background blobs bleeding past a section boundary, connector threads. Build these ONCE in the page shell (absolutely positioned over the full page, layered per the design's z-order, an SVG path layer works well for pipe/line networks), and list them in each section builder's dispatch prompt so no builder rebuilds its local slice. Split across builders they come out as broken segments with seams at every boundary. The same ownership rule applies to FOREGROUND elements straddling a boundary (a mockup half on one band, half on the next): assign each to exactly one owner (the shell, or one section rendering it with visible overflow) and tell the neighboring builder it is owned elsewhere.
- **Single section/component:** build it directly here.

## 2b. Speed rules (parallelize everything that can be)

Wall-clock time matters as much as fidelity. The design of the fan-out:

1. **Dispatch ALL section builders in ONE message** so they run concurrently. Never dispatch one, wait, dispatch the next. If the harness caps concurrent subagents, the extras queue automatically; still dispatch everything at once.
2. **Overlap the orchestrator's own work with the builders.** While builders run: export the full-frame reference PNG for the whole-frame gate, build the shell's cross-section decoration layer, and write the shell's spec entries. Do not sit idle waiting.
3. **Sequential is only for real dependencies.** Isolation comes from file ownership (one section = one file), not from ordering. The only serial steps are tokens + shell scaffold before wave 1, and the whole-frame gate after all waves. Everything else is parallel by default.
4. **Mobile is a second parallel wave.** When the design has a mobile frame, after the desktop wave lands dispatch one adapter per section simultaneously (same file ownership as wave 1), each building from the mobile frame at the mobile frame's own width and verifying at that width.
5. **Assets export inside each builder**, not as a serial pre-pass.

## 3. Build rules (the ones that cost time when ignored)

1. **Geometry from `get_metadata`, not `get_design_context`.** The Figma code wraps layers in `display:contents`, which collapses real offsets, so its positions are often wrong. Cross-check every position against metadata (its x/y are flat coords within the queried frame).
2. **Exact values + real fonts.** `text-[72px]`, token hexes, the actual font actually loaded. A wrong font invalidates every other measurement.
3. **ASSET-EXPORT RULE (the #1 time saver).** Any organic/multi-layer mask, clipped photo, gradient mesh, photo under a color overlay/duotone blend, or decorative vector composite: export that node as ONE png/svg and place it at its metadata coords. Do NOT hand-rebuild CSS `mask-image` composites. Budget: at most ONE attempt at a DOM/SVG clip; if it is not matching, export the node and move on.
4. **Reuse components.** Use the Code Connect map / the repo's library. Never rebuild a Button that already exists.
5. **Tag as you build.** Put `data-figma="<slug>"` on each section root and on the key elements you will assert in the spec (headings, buttons, columns, fixed-width containers). Stable selectors make the spec suite trivial.
6. **The frame width is a verification width, NEVER a CSS constant.** The page skeleton is always: full-bleed section bands, each containing a centered max-width content container (the design's content width). The coordinate math from metadata positions elements WITHIN their container, never against a fixed page canvas. A page hard-sized to the frame width only works at exactly that width and fails the responsive gate at every other viewport.

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
4. **WHOLE-FRAME GATE (the catch-all that makes this general).** After every section passes its own loop, verify the frame as ONE unit: export the full-frame reference at full resolution (`get_screenshot` with `maxDimension` larger than the frame's tallest edge), take a full-page shot at the frame width, diff them, and run all spec files together (`node scripts/figma-spec-check.mjs .figma/<name>/spec-*.json`). The section split, the shell, the subagents are internal machinery; the frame is the unit of truth. Any artifact no instruction anticipated (a decoration crossing sections, a seam between builders, a z-order mistake, an overlap) fails HERE and gets fixed by the loop instead of shipping. Nothing is done until the whole frame passes.
5. **OFF-FRAME RULE - the definition of done.** Pixel-perfect is required ONLY at each frame's own width (read `width` from `get_metadata` per frame, never hardcode it). At EVERY OTHER width the layout will and should differ; there the bar is "professional and robust," judged by an agent that LOOKS, not just a script: no horizontal scroll, no weird/empty white space, no overlap or clipping, intentional reflow. Run `node scripts/responsive-audit.mjs <url>` (320 to 3840): it hard-fails on horizontal scroll, non-full-bleed sections, and off-center content at any width, which is exactly the fixed-canvas failure mode. Build mobile from the mobile frame; never infer it.
6. **MANDATORY REVIEW WAVE - the build is not done without it.** After all gates pass, dispatch reviewer agents in parallel; each must LOOK at real renders and return APPROVED or a concrete issue list:
   - **Wide reviewer:** the `.audit/` screenshots at 1440 to 3840. Full-bleed bands, centered content, no fixed-canvas dead space, decorations scale sensibly.
   - **Narrow reviewer:** 320 to 768. Reflow quality: no overlap, no clipping, no squashed text, intentional stacking.
   - **Live reviewer:** drives the served page in a real browser end to end, scrolls the full height, hovers what looks hoverable, and checks the console for errors.
   Fix every issue and re-dispatch until ALL reviewers return APPROVED. A pending objection means the build is not done, no matter what the diff number says.
7. Run the repo's own checks (build, lint, typecheck) before calling it done.

## 6. Report

- Spec suite: N checks, 0 failed (or list what remains and why).
- Review wave: every reviewer's verdict, all APPROVED.
- Final diff % per section AND for the whole frame at the frame width. On photo-heavy frames judge by the worst-cell grid, not only the global %: exported photos diff as evenly spread anti-aliasing noise while real layout errors concentrate in cells; raise figma-diff's 4th arg (gate %, default 5) there instead of chasing photo noise.
- **Implied-behavior inventory.** Every interactive affordance the design shows but static data cannot express: carousels (arrows/dot cues/edge-clipped cards), accordion expanded states, tabs, dropdown menus, video players, form focus/validation states, marquees, animations the composition implies. Each is built FROZEN in its exactly-designed resting state; the inventory is the human's menu of what to wire up next. Never silently omit one.
- Responsive: pass/fail per width + anything visually off.
- Paths written, assets exported, and any substitutions flagged (placeholder copy replaced, undesigned states added).

Never claim pixel-perfect without the numbers. "Matched to spec values, visual pass still needed" is the honest fallback when a step could not run.
