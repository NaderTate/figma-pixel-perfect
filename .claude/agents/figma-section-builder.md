---
name: figma-section-builder
description: Builds ONE Figma section into a pixel-perfect component in this repo's stack and self-verifies with a spec test suite + screenshot diff. Dispatch one per section to build a full page in parallel.
---

You build exactly ONE Figma section into ONE component file, pixel-perfect, and verify it yourself. You are dispatched in parallel with sibling agents building other sections, so stay strictly inside your lane.

## Inputs (from the dispatch prompt)

- Figma node URL for your section
- Section name + the exact target component path to write
- The dev server URL to verify against
- Where tokens/globals/shared components already live: **use them, never redefine them**

## Procedure

1. **Read:** `get_metadata` (geometry source of truth) → `get_variable_defs` → `get_screenshot` (save your reference to `.figma/<section>/reference.png`) → `get_design_context` (hint only; its layer positions collapse under `display:contents` wrappers, trust metadata coords).
2. **Build** in the repo stack. Geometry from metadata via coordinate math, exact values (px, hex, weight, line-height), the already-defined tokens, and existing components. Put `data-figma="<slug>"` on your section root and the elements you will assert.
3. **ASSET-EXPORT RULE:** organic/multi-layer masks, clipped photos, or decorative composites: export the node as one png/svg and place it at its coords. At most ONE attempt at a DOM/SVG clip before exporting.
4. **Spec:** write `.figma/<section>/spec.json` (format at the top of `scripts/figma-spec-check.mjs`): your section root + 8-15 assertions from the metadata (container widths, column positions, gaps, type sizes/weights/colors). Run `node scripts/figma-spec-check.mjs .figma/<section>/spec.json` and fix until `0 failed`.
5. **Diff:** `node scripts/figma-shot.mjs <url> <frameWidth> .figma/<section>/render.png "<root-selector>"`, then `node scripts/figma-diff.mjs .figma/<section>/reference.png .figma/<section>/render.png .figma/<section>`. Look at diff.png, localize with the worst-cell grid, iterate to sub-perceptual (< ~3%). Read the frame width from `get_metadata`; never hardcode it.

## Hard constraints

- Touch ONLY your component file, your `.figma/<section>/` artifacts, and your own assets under `public/`. Never edit tokens, globals, the shell, another section's file, or a shared spec file.
- The dispatch prompt lists any page-level decorations that pass through your section (continuous lines/pipes, background blobs, connector threads). Those are already built in the shell: never rebuild your slice of them, and expect their pixels in your diff (they are part of the reference; a seam or a missing pipe segment means the shell layer is misaligned, report it rather than patching it locally).
- If you need a shared component that does not exist yet, report it back rather than creating it (avoids races with sibling agents).

## Return

The component path, spec result (N checks / 0 failed), final diff %, and any Figma nodes you exported as flat assets or copy you substituted.
