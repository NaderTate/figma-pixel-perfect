# INSTALL.md - agent install instructions

You are an AI coding agent installing the Figma Pixel-Perfect Kit into the CURRENT project (the working directory of this session). Do every step without asking questions, make reasonable decisions yourself, and report a summary at the end. Never delete or overwrite the user's existing files except where a step explicitly says so.

## 1. Get the kit files

If you were pointed at this file inside a local clone, use that clone. Otherwise clone fresh to a temp location OUTSIDE the project:

```
git clone --depth 1 https://github.com/NaderTate/figma-pixel-perfect <temp-dir>
```

## 2. Copy into the project root

- `FIGMA_PIXEL_PERFECT.md` -> project root. If the project already has a file with this name, keep the existing one untouched and note it in the summary.
- `.claude/commands/figma.md` -> `.claude/commands/` (create the folders if missing; merge with existing contents, never remove anything).
- `.claude/agents/figma-section-builder.md` -> `.claude/agents/`.
- `scripts/figma-spec-check.mjs`, `scripts/figma-shot.mjs`, `scripts/figma-diff.mjs`, `scripts/responsive-audit.mjs` -> `scripts/` (create if missing). If a same-named file already exists and differs, keep the existing one and note it.

## 3. Install the verify dependencies

Detect the package manager from the lockfile (`bun.lock`/`bun.lockb` -> bun, `pnpm-lock.yaml` -> pnpm, `yarn.lock` -> yarn, otherwise npm) and add dev dependencies `playwright`, `pixelmatch`, `pngjs`. If the project has no `package.json` at all, create a minimal one first (`{ "name": "figma-kit-host", "private": true }`).

Then install the browser: `npx playwright install chromium` (works regardless of package manager).

## 4. Gitignore

Ensure `.figma/` and `.audit/` are in `.gitignore` (create the file if the project has none, append if they are missing).

## 5. Auto-fill the "Your project" block

Open the copied `FIGMA_PIXEL_PERFECT.md` and fill its "Your project" block from what the repo actually contains, reading `package.json` and the file tree:

- **Framework**: from dependencies (next / react + vite / vue / nuxt / svelte / astro, with versions).
- **Styling**: tailwind (+ version) / CSS modules / styled-components / plain CSS, whatever the repo shows.
- **Components**: an existing component library dir if present (`components.json` implies shadcn/ui; else the main components folder path).
- **Icons**: the icon package in dependencies (lucide-react, react-icons, heroicons, ...).
- **Fonts**: next/font usage, @font-face files, or Google Fonts links, whichever the repo uses.
- **Dev server**: the `dev` script and its default URL (Next/Vite defaults: 3000/5173).
- **Checks**: the build / lint / typecheck scripts that actually exist in `package.json`, as one chained command.

Anything you cannot determine from the repo, leave as the placeholder and list it in the summary for the user to fill.

## 6. Clean up and verify

- Remove the temp clone if you created one.
- Verify the install honestly:
  - `.claude/commands/figma.md` and `.claude/agents/figma-section-builder.md` exist in the project.
  - `node scripts/figma-diff.mjs` (no args) prints its usage line and exits 2. That proves the scripts and their deps resolve.
  - Check whether Figma MCP tools (`get_design_context` / `get_metadata`) are available in your session.

## 7. Report

Tell the user, briefly:

1. What was copied, what was skipped because it already existed.
2. Deps installed with which package manager.
3. Which "Your project" fields were auto-filled and which they should fill by hand.
4. Whether the Figma MCP is connected. If it is not, point them to Figma's setup guide (https://help.figma.com/hc/en-us/articles/32132100833559) and remind them that Community files must be duplicated into their own drafts.
5. Final line, exactly this instruction: "Restart the Claude Code session so it picks up the /figma command, then run: /figma <your Figma link with ?node-id=>".
