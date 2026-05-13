# Repository Guidelines

## Project Structure & Module Organization
This repository is a Tauri desktop app with a Vite/React frontend and a Rust backend.
- `src/` contains the UI, hooks, styles, and locale files.
- `src/components/ui/` holds reusable UI primitives.
- `src-tauri/src/` contains the Tauri commands, storage, settings, clipboard, and window logic.
- `src-tauri/icons/` and `scripts/main-images/` store packaged app assets.
- `docs/` contains product and release documentation; `scripts/` contains maintenance and asset-generation utilities.

## Build, Test, and Development Commands
- `npm install` installs the frontend dependencies.
- `npm run dev` starts the Vite dev server for browser-only UI work.
- `npm run tauri dev` runs the full desktop app locally with the Rust backend.
- `npm run build` type-checks the frontend and produces a production Vite build.
- `npm run tauri build` creates a desktop release bundle.
- `npm run lint` runs ESLint across `src/`.
- `npm run format` formats TypeScript, TSX, and CSS in `src/`.
- `cd src-tauri; cargo test` runs Rust unit tests, including the license verification tests.

## Coding Style & Naming Conventions
Use TypeScript and React with 2-space indentation, semicolons, single quotes, and a 100-character line width. Follow the existing PascalCase convention for React components, camelCase for functions and hooks, and lowercase filenames for shared UI primitives such as `button.tsx` or `dialog.tsx`. Prefer small, focused modules and keep Tauri command logic in `src-tauri/src/` rather than mixing backend code into the UI.

## Testing Guidelines
There is no dedicated JS test runner in `package.json` today. Treat `npm run lint` and `npm run build` as the baseline frontend checks. On the Rust side, add unit tests next to the code they cover using `#[cfg(test)]` modules, following the pattern in `src-tauri/src/license.rs`. Name tests for behavior, not implementation.

## Commit & Pull Request Guidelines
Git history uses Conventional Commits, for example `feat: ...`, `fix: ...`, `docs: ...`, and `chore: ...`. Keep commit subjects short and imperative. Pull requests should include a brief summary, linked issue or task when available, and screenshots or screen recordings for UI changes. Mention any packaging, permission, or Tauri config changes explicitly because they affect desktop builds.

## Security & Configuration Tips
Do not commit secrets, signing material, or machine-specific build outputs. Review `src-tauri/capabilities/default.json` and `src-tauri/tauri.conf.json` carefully when changing permissions, windows, or plugins.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- /office-hours
- /plan-ceo-review
- /plan-eng-review
- /plan-design-review
- /design-consultation
- /review
- /ship
- /land-and-deploy
- /canary
- /benchmark
- /browse
- /qa
- /qa-only
- /design-review
- /setup-browser-cookies
- /setup-deploy
- /retro
- /investigate
- /document-release
- /codex
- /cso
- /autoplan
- /careful
- /freeze
- /guard
- /unfreeze
- /gstack-upgrade

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.
