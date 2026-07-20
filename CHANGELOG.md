# Changelog

## v2.0.0 - Zero-Setup Web App

- Added a static, no-build **web app** in `web/` that runs entirely in the browser
  and deploys to GitHub Pages — back up, browse, and share Google Classroom with
  no install and no terminal.
- Separated the app into three clean layers: **Scraper Engine** (`web/src/scraper`,
  browser-side Google Identity Services auth + Classroom/Drive REST), **Export/Import
  Serializer** (`web/src/archive`, one-click `.zip`/`.json` and share links), and
  **UI Dashboard** (`web/src/ui`, a searchable, filterable, light/dark viewer).
- Replaced the Desktop-OAuth + loopback + JSON-upload flow with one-click
  "Sign in with Google" (no client secret, no local server).
- Added drag-and-drop import of `.zip`/`.json`/`master_index.json`, load-from-URL,
  inline share links, and a live demo that needs no login.
- Kept full data-model compatibility: the web app reads and writes the same
  `master_index.json` graph as the local engine.
- Added a GitHub Pages deploy workflow, dependency-free unit tests, a `check:web`
  syntax gate, a local preview server (`npm run web`), and new docs
  (`docs/web-app-guide.md`, `docs/refactor-strategy.md`).
- The original local engine and `caxa` executables are unchanged and remain the
  advanced/bulk-download path.

## v1.1.0 - Standalone Release UX

- Added a clean staged standalone build command for local executable builds.
- Fixed packaged UI actions so they launch the bundled crawler engine.
- Added dashboard OAuth credential status and JSON upload.
- Added a no-coding user guide for first run, auth, downloads, output, and troubleshooting.
- Updated release automation to publish executables with the user guide as release notes.

## v0.1.1 - Production Workflow Hardening

- Added production selective-download UI implementation prompt.
- Added CI, CodeQL, release, Dependabot, and compliance validation configuration.
- Added environment and promotion documentation.
- Locked local API host to `127.0.0.1` by default.

## v0.1.0 - Initial Public Release

- Added API-first Google Classroom crawler.
- Added Google OAuth desktop flow with localhost callback.
- Added Drive download/export support for Docs, Slides, Sheets, Drawings, binary files, and references.
- Added SQLite metadata storage and JSON archive export.
- Added resumable engine command with preflight checks.
- Added local API foundation for future UI work.
- Added sanitizer, tests, release checklist, and privacy-safe public docs.
