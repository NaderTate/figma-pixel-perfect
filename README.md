# Figma Pixel-Perfect Kit

Turn any Figma design into pixel-perfect code with Claude Code. Not "pretty close": verified with numbers, by turning the design itself into a test suite the agent builds against, plus a pixel diff at the exact frame width.

Most AI Figma-to-code attempts fail the same way: the model looks at a screenshot and approximates. This kit makes that impossible. The agent pulls the design as **data** (exact coordinates, sizes, colors, weights), builds from the numbers, then proves the result with scripts that fail loudly until the render matches.

## What's inside

| File | What it does |
|---|---|
| `FIGMA_PIXEL_PERFECT.md` | The rules. Works standalone in any repo with any agent; the methodology in one file. |
| `.claude/commands/figma.md` | `/figma <node-url>`: the whole workflow as one Claude Code command. |
| `.claude/agents/figma-section-builder.md` | Subagent that builds one section per agent, so full pages build in parallel. |
| `scripts/figma-spec-check.mjs` | **The design as a test suite.** Asserts real DOM boxes and computed styles against the Figma geometry; failures name the element, property, and delta. |
| `scripts/figma-shot.mjs` | Screenshots your dev server at the exact Figma frame width (fonts awaited, 1x scale). |
| `scripts/figma-diff.mjs` | Pixel-diffs the render against the Figma reference; prints mismatch % + a worst-region grid; exits non-zero when off, so the agent loops until it isn't. |
| `scripts/responsive-audit.mjs` | Checks every width from 320 to 3840: no horizontal scroll, screenshots each for visual review. |

## Install (into your project)

1. Copy `FIGMA_PIXEL_PERFECT.md`, `.claude/`, and `scripts/` into your repo root.
2. `npm i -D playwright pixelmatch pngjs && npx playwright install chromium`
3. Connect the Figma MCP server to Claude Code (Figma desktop app: Dev Mode MCP server, or Figma's remote MCP server). See Figma's guide: https://help.figma.com/hc/en-us/articles/32132100833559
4. Add `.figma/` and `.audit/` to your `.gitignore`.

Note: if the design is a Community file, duplicate it into your own drafts first; the MCP only reads files you own.

## Use

Fill in the **Your project** block in `FIGMA_PIXEL_PERFECT.md` (your stack, dev command, checks). Then, in Figma, right-click the frame and **Copy link to selection** (the link must contain `?node-id=`), and in Claude Code:

```
/figma <that link>
```

That's it. The agent reads the design as data, builds in your stack, writes a spec test suite from the geometry, and iterates until the spec passes and the pixel diff is sub-perceptual. Full pages fan out to one subagent per section, in parallel.

No Claude Code? Use `FIGMA_PIXEL_PERFECT.md` alone with the kickoff prompt inside it; it carries the whole methodology.

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

## License

MIT. Use it, ship it, share it.
