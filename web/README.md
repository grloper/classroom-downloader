# Classroom Archiver — Web App

A **zero-build, static** web app: back up, browse, and share Google Classroom
content entirely in the browser. Deployed to GitHub Pages from this folder.

- **No framework, no bundler.** Plain HTML + CSS + native ES modules.
- **No server.** Google auth uses Google Identity Services (browser token flow);
  Classroom/Drive are called directly with `fetch`; exports are built with JSZip.
- **Private by default.** Data is processed locally; nothing is uploaded.

## Run it locally

```bash
npm run web        # serves ./web at http://127.0.0.1:8080 (no deps)
```

Or use any static server (`python -m http.server`, etc.) rooted at `web/`.

## Architecture

Three cleanly separated concerns (see [`../docs/refactor-strategy.md`](../docs/refactor-strategy.md)):

| Layer | Folder | Responsibility |
| --- | --- | --- |
| **Scraper Engine** | `src/scraper/` | Google auth, Classroom/Drive REST, normalize, orchestrate |
| **Serializer** | `src/archive/` | Canonical format, `.zip`/`.json` export, import, share links |
| **UI Dashboard** | `src/ui/` | Landing, scrape wizard, viewer, preview, filters, theme |

Shared helpers live in `src/util/`. `config.js` holds the (non-secret) Google
Client ID and app settings. `sample/demo-archive.json` powers the live demo.

## Configuration

Set a Google **Web** OAuth Client ID in `config.js` (and add your Pages origin to
the client’s *Authorized JavaScript origins*) to give users one-click sign-in.
Leave it blank to let each user paste their own. The Client ID is not a secret.

## Data format

The archive `graph` is byte-for-byte the shape of the CLI engine’s
`output/master_index.json`, so files from either tool open in this viewer. See
`src/archive/format.js`.

## Tests

The pure modules (normalize, format, filters, base64, hash) are dependency-free
and unit-tested in Node:

```bash
node --test test/web-archive.test.js   # from the repo root
npm run check:web                      # syntax-check every web module
```
