# Figma Pixel-Perfect Kit

Turn any Figma design into pixel-perfect code with Claude Code. Not "pretty close": verified with numbers, by turning the design itself into a test suite the agent builds against, plus a pixel diff at the exact frame width.

Most AI Figma-to-code attempts fail the same way: the model looks at a screenshot and approximates. This kit makes that impossible. The agent pulls the design as **data** (exact coordinates, sizes, colors, weights), builds from the numbers, then proves the result with scripts that fail loudly until the render matches.

## Install (paste one prompt)

Open Claude Code **in your project** and paste this:

```
Install the Figma Pixel-Perfect Kit into this repo:
clone https://github.com/NaderTate/figma-pixel-perfect to a temp folder,
read its INSTALL.md, and follow it exactly.
```

Claude copies the kit in, installs the verify tools, updates your .gitignore, and auto-fills the kit's project config from your repo. When it finishes, **restart the Claude Code session** (that's when it picks up new slash commands).

One thing Claude can't do for you: connect the **Figma MCP server** to Claude Code (Figma desktop app, Dev Mode MCP server, or Figma's remote server). Setup guide: https://help.figma.com/hc/en-us/articles/32132100833559. If the design is a Community file, duplicate it into your own drafts first; the MCP only reads files you own.

## Use

1. In Figma, right-click the frame you want built and choose **Copy link to selection**. The link must contain `?node-id=`.
2. In Claude Code:
   ```
   /figma <that link>
   ```

The agent reads the design as data, builds in your stack, writes a spec test suite from the geometry, and iterates until the spec passes and the pixel diff is sub-perceptual. Full pages fan out to one subagent per section, in parallel.

<details>
<summary><b>Manual install</b> (if you'd rather copy files yourself)</summary>

1. Copy `FIGMA_PIXEL_PERFECT.md`, the `.claude/` folder, and the `scripts/` folder into your repo root (merge `.claude/` with an existing one, don't replace it).
2. `npm i -D playwright pixelmatch pngjs && npx playwright install chromium`
3. Add `.figma/` and `.audit/` to your `.gitignore`.
4. Fill in the "Your project" block at the top of `FIGMA_PIXEL_PERFECT.md`: framework, styling, component library, dev command, checks.
5. Restart the Claude Code session so `/figma` appears.

</details>

## What each file does

### `FIGMA_PIXEL_PERFECT.md` - the rules

The whole methodology in one file: read the design as data (never eyeball), translate values literally, derive layout from coordinate math, reuse components and real assets, dodge the component-library traps, and verify with numbers. It works **standalone** in any repo with any capable agent: if you don't use the rest of the kit, copy just this file and use the kickoff prompt inside it.

### `.claude/commands/figma.md` - the `/figma` command

The methodology as an executable Claude Code slash command. Handles the once-per-repo setup (design tokens synced into your theme, deps installed), then per design: read order, section triage, build rules, the spec suite, and the full verification loop. Usage:

```
/figma <figma-node-url>
```

### `.claude/agents/figma-section-builder.md` - the parallel section builder

A Claude Code subagent that builds exactly ONE section into ONE component and verifies it itself. `/figma` dispatches one per section when the frame is a full page, so the page costs about as much wall-clock as its slowest section. You never invoke this directly.

### `scripts/figma-spec-check.mjs` - the design as a test suite

The strongest verifier in the kit. The agent extracts the Figma geometry and key styles into a `spec.json`, and this script asserts the **real rendered DOM** against it in a real browser (boxes via `getBoundingClientRect`, styles via `getComputedStyle`, fonts awaited). Every failure names the exact element, property, expected, actual, and delta:

```
node scripts/figma-spec-check.mjs .figma/hero/spec.json

[hero]
  FAIL title box.x: expected 120, got 132.0 (delta +12.0)
  FAIL title font-weight: expected 600, got 500
  ok   cta

18 checks, 2 failed
```

Exits non-zero on any failure, so the agent loops until `0 failed`. The spec format is documented at the top of the script. Accepts several spec files at once for multi-section pages, plus `--url` / `--width` overrides.

### `scripts/figma-shot.mjs` - exact-width screenshots

Screenshots your served page at the **exact Figma frame width**, at 1x scale, after fonts load, optionally cropped to one element, so the render and the Figma reference can be compared 1:1:

```
node scripts/figma-shot.mjs http://localhost:3000 1440 .figma/hero/render.png "[data-figma='hero']"
```

### `scripts/figma-diff.mjs` - the pixel diff

Objective pixel comparison between the Figma reference PNG and your render. Prints the mismatch %, a 4x4 grid naming the worst regions, and writes a `diff.png` with every differing pixel highlighted:

```
node scripts/figma-diff.mjs .figma/hero/reference.png .figma/hero/render.png .figma/hero

diff: 1.84%  (9812/532800 px)  ->  .figma/hero/diff.png
worst cells (col,row = pct):
  (2,1) = 6.3%
```

Exits non-zero above 5% so an agent (or CI) can gate on it. Under ~2% is pixel-perfect territory; anti-aliasing accounts for most of the remainder.

### `scripts/responsive-audit.mjs` - every other width

Pixel-perfect applies at each frame's own width; everywhere else the bar is "professional and robust". This script loads your page at 13 widths (320 to 3840), fails on any horizontal scroll, names the worst overflowing element, and screenshots every width into `.audit/` so the agent can visually review reflow:

```
node scripts/responsive-audit.mjs http://localhost:3000
```

## How the loop works

```
Figma MCP (data, not pictures)          Your repo
  get_metadata      x/y/w/h   ──►  spec.json (the design as tests)
  get_design_context values   ──►  build in your stack
  get_variable_defs tokens    ──►  map to your theme
  get_screenshot    reference ─┐
                               ▼
             ┌─── figma-spec-check ── every box + style asserted ──┐
   fix ◄─────┤                                                     ├── green + <3% ──► done
             └─── figma-shot + figma-diff ── mismatch % ───────────┘
                        (then responsive-audit, 320 → 3840)
```

Two verifiers on purpose: the spec suite catches what the eye misses (a 4px drift, a 500-vs-600 font weight) and names the exact element; the pixel diff catches what numbers miss (font rendering, assets, masks). Green spec + sub-perceptual diff is what "pixel-perfect" means here.

## Not using Claude Code?

`FIGMA_PIXEL_PERFECT.md` is self-contained: copy it into your repo, fill in the project block, and use the kickoff prompt inside it with any agent that has the Figma MCP. The scripts are plain Node and work with any agent (or by hand) too.

## License

MIT. Use it, ship it, share it.
