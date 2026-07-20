# Strategy & Refactor Plan — from CLI tool to zero-setup web app

This document is the answer to “**analyze → propose strategy → refactor plan**”.
It explains why the project was reshaped, the one constraint that cannot be
engineered away, the architecture that was chosen, and how the old code maps to
the new modules.

---

## 1. Analysis of the original tool

The original project is a capable **local-first Node.js engine**:

| Concern | Where it lived | Notes |
| --- | --- | --- |
| Auth | `src/auth/googleApi.js` | OAuth 2.0 **Desktop** client + localhost loopback receiver |
| Crawl | `src/crawler/apiCrawler.js` | Classroom REST: courses, topics, coursework, materials, announcements |
| Normalize | `src/parsers/classroom.js` | Raw API → `{courses, topics, materials, attachments}` |
| Download | `src/downloaders/*` | Drive `files.get`/`export`, references for links/YouTube/forms |
| Store | `src/storage/database.js` | SQLite (`better-sqlite3`) |
| Export | `src/storage/exporter.js` | `output/master_index.json` + per-course JSON |
| UI | `src/api/server.js` + `src/api/ui/index.html` | Local HTTP server on `127.0.0.1`, React via CDN + Babel, spawns the engine as a detached process |
| Package | `scripts/build-standalone.js` | `caxa` single-file executables per OS |

**Friction inventory** (why a non-technical user bounces off it):

1. **Google Cloud project setup per user** — enable APIs, configure the OAuth
   consent screen, add yourself as a *Test user*, create a **Desktop** OAuth
   client, download JSON. This is the single largest barrier.
2. **Install/run a binary** (or clone + `npm install`), then upload the OAuth
   JSON, then watch a **terminal** for progress.
3. **Intimidating UI** — an all-caps “brutalist” console (`EXECUTE_PURGE`,
   `SYS.ERR`, `INIT_DOWNLOAD`) that reads as a hacking tool, not a study aid.
4. **No sharing / no viewer** — an archive is a folder of files; a classmate who
   receives it has nothing to open it with.

### The one hard constraint

Google Classroom and Drive are **OAuth-only** APIs, and `drive.readonly` is a
*restricted* scope. **Some** Google Cloud OAuth client must exist, and its app
must either be verified or list each signer as a Test user. **No refactor
removes this** — it is Google policy, not a code smell. The realistic goal is
therefore to make that step *as small as possible* and to make **everything that
doesn’t need Google** truly zero-setup.

---

## 2. Proposed strategy

### Options considered

| Option | Zero-setup for viewers? | Zero-setup for scraping? | Maintainer cost | Verdict |
| --- | --- | --- | --- | --- |
| **A. Static SPA on GitHub Pages (client-side Google APIs)** | ✅ yes | ⚠️ needs an OAuth **Client ID** (no secret, no server) | Low — commit a folder | **Chosen** |
| B. Electron/Tauri desktop build | ❌ install required | ⚠️ same OAuth need | High — native builds, signing | Rejected as the primary path (kept as the CLI/`caxa` route for power users) |
| C. Browser extension | ❌ store install/review | ⚠️ same OAuth need | Medium/High | Rejected — distribution friction, review latency |

**Why A wins:** modern browsers can do the *entire* Google flow client-side with
**Google Identity Services (GIS)** — the user clicks “Sign in with Google”, the
browser receives a short-lived access token, and the Classroom/Drive REST APIs
(which are CORS-enabled) are called directly with `fetch`. No client secret, no
loopback server, no JSON upload, no local install. The site is a folder of
static files, so GitHub Pages hosts it for free and updates on push.

Crucially, the **viewer** half needs no Google at all: anyone can open a shared
`.zip`/`.json` (or a link) and browse it. That is the part that becomes *truly*
zero-setup, which is where most of the day-to-day value is.

### Handling the OAuth Client ID gracefully

The app supports both ownership models with the same code:

- **Maintainer-provided** (best UX): set `web/config.js → google.clientId` once
  and add the Pages origin to the client’s *Authorized JavaScript origins*.
  Users then just click “Sign in”. (Keep the app in Testing mode + Test users,
  or complete verification.)
- **User-provided** (no maintainer burden): if no Client ID is baked in, the
  scraper shows a single “paste your Client ID” field (remembered in
  `localStorage`) with a 2-minute guide. The Client ID is **not a secret** and is
  safe in a public static site.

---

## 3. Refactor plan — clean separation of the three concerns

The task asked for the **Scraper Engine**, the **Export/Import Serializer**, and
the **UI Dashboard** to be separated. The new `web/` app is built exactly along
those seams, and each new module maps back to the proven Node logic:

```
web/
  config.js                     # app + Google config (no secrets)
  index.html                    # SPA shell (hash-routed, no build step)
  styles.css                    # clean, friendly design system (light/dark)
  src/
    scraper/                    # ── SCRAPER ENGINE (client-side) ──
      googleAuth.js             #   GIS token client   ⇐ replaces auth/googleApi.js + loopback
      googleFetch.js            #   authorized fetch + retry/backoff  ⇐ utils/retry.js
      classroomApi.js           #   Classroom REST      ⇐ crawler/apiCrawler.js
      driveApi.js               #   Drive get/export    ⇐ downloaders/driveDownloader.js
      normalize.js              #   data model          ⇐ parsers/classroom.js (verbatim port)
      scrapeEngine.js           #   orchestration       ⇐ crawler/run.js + downloadManager.js
    archive/                    # ── EXPORT/IMPORT SERIALIZER ──
      format.js                 #   canonical format, graph builder, share codec  ⇐ storage/database.js#getCoursesGraph
      exporter.js               #   .zip / .json / share link  ⇐ storage/exporter.js
      importer.js               #   load .zip / .json / URL / link
    ui/                         # ── UI DASHBOARD / VIEWER ──
      app.js                    #   router, top bar, export/share menus
      landing.js                #   drop-to-open + demo + start-scrape
      scraperView.js            #   3-step wizard  ⇐ src/api/ui (reimagined, friendly)
      viewer.js                 #   browse/search/filter dashboard  ⇐ src/api/ui THE_ARCHIVE tab
      preview.js                #   inline file preview (image/pdf/video/audio)
      filters.js                #   pure search/filter over the graph
      theme.js, toast.js        #   light/dark + notifications
    util/                       #   dom, format, paths, hash, base64, vendor loader
  sample/demo-archive.json      #   instant, no-login demo
```

### Data-model compatibility (the key to interoperability)

`archive/format.js#buildGraph` produces **the exact shape** of the Node engine’s
`output/master_index.json` (`getCoursesGraph`). Therefore:

- Archives scraped in the browser and archives produced by the CLI are the
  **same format** and open in the same viewer.
- The viewer’s importer accepts a raw `master_index.json`, a full archive
  envelope, or a `.zip`, with no conversion.

The only intentional difference is the ID hash (browser uses a small FNV hash
instead of `node:crypto`); IDs are opaque to the viewer, so this is safe and it
keeps every core module dependency-free and unit-testable in Node.

### What was added, what was preserved

- **Added:** the entire `web/` app, a GitHub Pages workflow
  (`.github/workflows/pages.yml`), dependency-free unit tests
  (`test/web-archive.test.js`), a `check:web` syntax gate, and a local preview
  server (`npm run web`).
- **Preserved (non-destructive):** the Node engine, its tests, the `caxa`
  release path, and all existing docs. The CLI is now positioned as the
  **advanced / bulk-download** route; the web app is the **primary, friendly**
  experience. Nothing was deleted, so existing users are unaffected.

---

## 4. Deployment

- **GitHub Pages** builds nothing — the workflow uploads `web/` as the Pages
  artifact on every push to `main` that touches it. A `.nojekyll` file keeps
  Pages from mangling the `src/` folder.
- **Enable once:** repo *Settings → Pages → Source: GitHub Actions*. The app is
  then live at `https://<owner>.github.io/<repo>/`.
- **Custom domain / origin:** whatever origin you deploy to must be added to the
  OAuth client’s *Authorized JavaScript origins* for sign-in to work.

---

## 5. Privacy & safety posture

- Everything runs in the browser. Course data, tokens, and files are **never
  sent to any server we control** — GIS talks to Google, `fetch` talks to
  Google, and exports are generated locally with `JSZip`.
- Inline **share links strip local file paths** and keep only public metadata +
  source links, so a link can’t leak a file that lives only on your disk.
- The access token is short-lived and held in memory only; “Sign out” revokes it.

---

## 6. Roadmap (natural next steps)

- Optional **self-contained export** (bundle the viewer into the `.zip` for fully
  offline viewing).
- **PWA/offline** install of the viewer.
- **Selective scraping** (choose courses/items before downloading) — the Node
  engine already models this; the web wizard can grow the same picker.
- Richer previews (Office formats via a viewer) and per-course export.
