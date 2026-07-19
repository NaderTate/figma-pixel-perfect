# Figma to Pixel-Perfect Code: Agent Rules

Instructions for an AI coding agent (Claude Code or similar) that turn a Figma design into code that matches it exactly, on the first pass. Drop this file into any repo, fill in the project block, and point your agent at it.

This file works standalone. If the full kit is installed (`.claude/commands/figma.md` + `scripts/`), the `/figma` command executes this methodology end to end and the scripts make the verification mechanical.

## How to use

1. Copy this file to your repo root (keep the filename).
2. Fill in the **Your project** block below.
3. In Figma, right-click the frame you want built and choose **Copy link to selection**. The link must contain `?node-id=`.
4. Prompt your agent:

```
Read FIGMA_PIXEL_PERFECT.md and follow it exactly.
Build this design: <figma link>
Work one section at a time. After each section, use your browser tool
(Claude in Chrome or Playwright MCP) to open the dev server, screenshot
what you built, compare it against the Figma reference, and iterate
until they match. Don't tell me it's done until the loop passes.
```

**Requirements:** the Figma MCP server connected to your agent (the desktop Dev Mode server or Figma's remote MCP server), and a browser tool for the verification loop: **Claude in Chrome** or the **Playwright MCP**. The agent needs to open a page, resize the viewport, take screenshots, and run JavaScript in the page; both tools do all four. If the design is a Community file, duplicate it into your own drafts first; the MCP only reads files you own.

## Your project (fill in once)

```
Framework:    <e.g. Next.js 15 + React 19>
Styling:      <e.g. Tailwind v4>
Components:   <e.g. shadcn/ui in src/components/ui - reuse before creating>
Icons:        <e.g. lucide-react>
Fonts:        <e.g. next/font / self-hosted files>
Dev server:   <e.g. npm run dev -> http://localhost:3000>
Checks:       <e.g. npm run build && npm run lint && npx tsc --noEmit>
```

The agent translates everything into this stack. The Figma MCP returns a React + Tailwind representation by default; treat it as a spec to translate, not code to paste.

---

## 0. The one rule that prevents 90% of fidelity bugs

**Never eyeball a screenshot and guess values. Pull the spec as data, then translate the numbers literally.**

Nearly every fidelity failure (wrong alignment, wrong font weight, wrong spacing) comes from looking at a picture and approximating. The picture lies about pixels; the design data does not. Screenshots are for verification at the end, never for measurements.

## 1. Read the spec in this order, for every node

Do these before writing any component code:

1. **`get_metadata`** - the sparse node tree with absolute `x / y / width / height` for every layer. This is ground truth for layout and your map of the frame. Read the frame's own width from here; designs are not all 1440 wide, never assume.
2. **`get_design_context`** - the exact values: hex colors, px font sizes, font weights, line heights, letter spacing, gaps, paddings, radii, borders, shadows, plus generated code and asset URLs. Treat the **values** as gospel. Treat the **structure** as a starting point only: it loves absolute positioning and one-off divs. Rebuild with semantic HTML, flex/grid, and your project's components, while preserving every measurement.
3. **`get_variable_defs`** - the design-token map (token name to concrete value). If your project has matching tokens, use them; otherwise use the raw values.
4. **`get_screenshot`** - the reference image. Save it for the verification loop in section 7. Do not measure from it, and never let it override a number from steps 1-2.

**Large frames:** if a response truncates or overflows context, do not work from a partial paste. Use `get_metadata` to map the children, then call `get_design_context` per child node and build section by section.

## 2. Translate values literally

Copy exactly, from the data, for every element:

- [ ] **Colors** - exact hex / rgba (or the mapped token). No "close enough" grays.
- [ ] **Font family** - the exact family and weights, actually loaded (Google Fonts, next/font, or files). A wrong font throws off every other measurement.
- [ ] **Font size, weight, line height, letter spacing** - exact. `font-medium` is not `font-semibold`; weight is one of the most common misses.
- [ ] **Gaps, padding, margins** - exact px.
- [ ] **Border radius, border width and color** - exact.
- [ ] **Widths and heights** - exact, especially fixed widths (containers, label columns).
- [ ] **Shadows** - the full box-shadow value, every layer of it.
- [ ] **Opacity and blend modes** where present.

When a named utility class and the spec disagree (`rounded-2xl` vs `rounded-[24px]`), use the arbitrary value that matches. Pixel-perfect beats idiomatic-but-wrong.

## 3. Layout from geometry, not vibes

`get_metadata` gives absolute coordinates. Derive layout with arithmetic instead of guessing:

- **Vertical gap** between stacked items = `next.y - (prev.y + prev.height)`.
- **Horizontal gap** = `next.x - (prev.x + prev.width)`.
- **Container width**: read the frame's `width` directly. A modal is 666 wide because the data says 666, not "about 640".
- **Label/value rows**: before reaching for `justify-between`, check whether the value starts at a fixed `x` (a fixed-width label column). `value.x - label.x` is the column width. This one mistake ships constantly.
- **Fixed heights**: if a row has a fixed height in the data, give it that height, and add `shrink-0` when it sits inside an overflowing flex column so it cannot compress.
- **Cross-check positions against `get_metadata`**: generated code sometimes wraps layers so their real offsets collapse (for example `display: contents` wrappers). The metadata coordinates are the truth.

## 4. Reuse before you invent

- **Project components first.** Build with the primitives named in the project block before writing new ones.
- **Code Connect**: if the Figma file has Code Connect mappings, fetch them (`get_code_connect_map`) and use the mapped components. Without a mapping the model is guessing, so state which code component you chose for each Figma component.
- **Tokens over raw values** when the project has them; raw values when it does not. If the design system has more than one token family, match the family the node actually uses; never mix families in one component.
- **Exact icons**: use the icon library the design references (asset layer names usually reveal it, e.g. Lucide). Match the exact glyph, never a lookalike. Check the icon component's props before passing extras like `strokeWidth`.
- **Real assets**: download images and SVGs via the MCP (`download_assets`, or the asset URLs inside `get_design_context`) instead of recreating them. Export raster images at 2x for retina.
- **Organic or masked images** (photos inside blob shapes, multi-layer masks): fill the shape with an SVG `clipPath` at exact offsets, or export the whole composite as a single asset. Budget one attempt at a DOM/SVG clip; if it is not matching, export the node as one image and move on. Hand-porting layered CSS masks is unreliable and eats hours.

## 5. Confirm the node and the content are real

- **Right node**: shared links go stale. Confirm the frame is the canonical, current version before building; check sibling frames and pages for a newer variant.
- **Placeholder copy**: designers duplicate template frames, so body copy can be leftovers from another screen. Keep the verified structure (geometry, type, spacing) but substitute meaningful copy for the feature you are actually building, and flag the substitution to the human instead of shipping nonsense.
- **Similar is not same**: two rows that look alike can be different Figma patterns with different specs. Read each node's own data.
- **Do not invent states**: build hover, focus, active, empty, and error states only from what the design defines (variants, annotations, prototype connections). If a state you need is not designed, name it and propose one, flagged as your addition.

## 6. Component-library traps (they override you silently)

If the project uses a styled component library (shadcn/ui, Radix wrappers, MUI, and similar):

- **Class merges across breakpoints**: a primitive's built-in responsive class (shadcn Dialog ships `sm:max-w-lg`) beats your bare `max-w-[666px]` at that breakpoint, because class mergers do not dedupe across responsive variants. Override at the same variant too: `max-w-[666px] sm:max-w-[666px]`.
- **Baked-in extras**: primitives ship defaults such as built-in close buttons, or descendant selectors that force-size every `svg` inside them (which distorts non-square icons). Read the primitive's source before styling over it, and disable what the design does not show (`showCloseButton={false}`) instead of stacking a duplicate.
- **Portals plus scroll locks**: an overlay (popover, combobox) portalled outside a scroll-locked modal will not scroll for real users even though programmatic scrolling works, so automated checks look green while the UI is broken. Give the overlay its own scroll-lock layer (for example Radix's `modal` prop). Never fix it by re-parenting the portal into a transformed container; that breaks the overlay's positioning.

## 7. The verification loop (this is what makes it pixel-perfect)

"It compiles" and "looks right to me" are not verification. Run this loop on every section:

1. **Numeric self-check.** Sum your paddings, gaps, and fixed sizes and compare against the `get_metadata` numbers before opening a browser.
2. **Open what you built in a real browser** using your browser tool: Claude in Chrome (open a tab to the dev server, resize the window to the frame's width, screenshot) or Playwright MCP (`browser_navigate`, `browser_resize`, `browser_take_screenshot`). The viewport width must equal the Figma frame's own width from `get_metadata`, and the screenshot must cover the same crop as the reference. Do not skip the browser and reason from the code; the whole point is seeing what actually rendered.
3. **Look, then diff.** First put your render next to the reference (`get_screenshot`) and enumerate every concrete delta you can see: position, size, weight, color, spacing. Then run the diff script below for the number and open the diff image to localize what your eye missed. Fix from the data, re-screenshot, repeat until the number stops improving. Under about 2% mismatched pixels is pixel-perfect territory; anti-aliasing accounts for most of the remainder.
4. **Measure the live DOM** for anything still off: run `getBoundingClientRect()` / `getComputedStyle()` in the page (Claude in Chrome's javascript tool, or Playwright's `browser_evaluate`) and compare the results against the Figma geometry. Numbers, not squinting.
5. **Run the project checks** from the project block (build, lint, typecheck) before calling it done.

**With the kit installed, steps 2-4 are scripts** (no MCP browser needed):

```
node scripts/figma-shot.mjs <url> <frameWidth> render.png "<section-selector>"
node scripts/figma-diff.mjs reference.png render.png
node scripts/figma-spec-check.mjs spec.json     # the design's geometry as a test suite
node scripts/responsive-audit.mjs <url>         # every width from 320 to 3840
```

The spec suite (`figma-spec-check`) is the strongest of the four: the agent extracts the design's geometry into `spec.json` up front and builds until the suite is green, and every failure names the exact element, property, expected, actual, and delta. See `.claude/commands/figma.md` for the full workflow.

**No browser or no vision?** You can still hit pixel-perfect: build strictly from sections 1-3, do step 1 rigorously, and report exactly which numbers you matched ("modal 666 wide; label column 140; row gap 16; title 20px/600"). Say "matched to spec values, visual pass still needed". Never claim visually verified when you did not look.

## 8. Every other width

Pixel-perfect applies at each frame's own width. Designs usually ship one frame per breakpoint (desktop, mobile); match each frame at its own width, and build mobile from the mobile frame, never by inference. Between and beyond those widths the bar is professional, not identical:

- no horizontal scrollbars
- nothing overlapping, clipping, or squashed
- no accidental dead space
- intentional reflow (stacking, wrapping) rather than shrinking text and images

Verify by looking at real renders at several widths (for example 360 / 768 / 1024 / 1440 / 1920), not by trusting an overflow check alone. The kit's `responsive-audit.mjs` screenshots the full matrix for exactly this review.

## 9. Definition of done

Report all of this, honestly:

- Spec suite result (N checks, 0 failed) if the kit is installed
- Diff percentage per section at the frame's exact width (or the numeric-fallback wording from section 7)
- For multi-section pages: the WHOLE frame verified as one unit (one full-page screenshot diffed against the full-frame reference), not just each section in isolation. The whole-frame pass is what catches seams, cross-section decorations, overlaps, and z-order mistakes that no per-section check and no written rule anticipated. The design's own pixels are the spec; verifying against all of them at once is what makes this method general instead of a growing list of special cases.
- The key numbers you matched (container widths, columns, gaps, type sizes)
- Everything substituted or flagged: placeholder copy replaced, icon mappings chosen, states you added that the design did not define
- Project checks passing

If any item is missing, the task is not done. Say what remains instead of rounding up.

## The 10-second version

1. `get_metadata`, then `get_design_context`, then `get_variable_defs`, then `get_screenshot`. Data first, picture last.
2. Copy values literally: exact hex, px, weight, line height, radius, shadow, font.
3. Derive layout from coordinate math, not `justify-between` guesses.
4. Reuse project components, tokens, real assets, exact icons, real fonts.
5. Confirm the node is canonical and the copy is real.
6. Watch library overrides: breakpoint class merges, baked-in extras, portal scroll locks.
7. Turn the geometry into a spec test suite and build until it is green.
8. Open the build in a real browser, screenshot-diff at the frame's exact width, and iterate against the number.
9. Other widths: professional, nothing broken.
10. Report numbers and gaps honestly.
