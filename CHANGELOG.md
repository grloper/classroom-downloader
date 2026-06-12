# Changelog

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
