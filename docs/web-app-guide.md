# Classroom Archiver — Web App Guide

The web app lets you **back up, browse, and share** your Google Classroom right
in your browser. Nothing is installed, and your data never leaves your device
unless you choose to share it.

There are two ways to use it, depending on what you want to do.

---

## A. Just viewing an archive (no setup at all)

If someone sent you a `.zip` or `.json` archive, or a share link:

1. Open the app: **`https://<owner>.github.io/classroom-downloader/`**
2. Do any one of these:
   - **Drag the file** onto the “Open an archive” box (or click to browse).
   - Paste a **link to an archive** and press *Load*.
   - Open the **share link** you were given — it opens straight into the viewer.
3. Browse courses in the sidebar, **search** across everything, and **filter** by
   item type or attachment source. Click a file to preview it.

Want to see it in action first? Click **“View live demo”** on the home page — it
loads a sample classroom instantly.

That’s it. No account, no sign-in, no install.

---

## B. Archiving your own Classroom

Reading your Classroom requires Google sign-in. Google only allows this through
an **OAuth Client ID**. If the person who deployed this app already added one,
you can skip straight to *“Sign in and archive”*. Otherwise, do the one-time
setup below (about 2 minutes, free).

### One-time setup — create a Google OAuth Client ID

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create (or pick) a project.
3. **APIs & Services → Library**: enable **Google Classroom API** and
   **Google Drive API**.
4. **APIs & Services → OAuth consent screen**:
   - User type **External**, keep it in **Testing**.
   - Under **Test users**, add the Google account(s) you’ll sign in with.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add the exact origin where the app
     is hosted, for example:
     - `https://<owner>.github.io` (GitHub Pages), and/or
     - `http://127.0.0.1:8080` if you preview locally with `npm run web`.
   - Create it and **copy the Client ID** (looks like
     `1234567890-abc.apps.googleusercontent.com`).

> The Client ID is **not a secret** — it’s safe to paste into the app or commit
> to a public site. No client secret is ever used in the browser.

### Sign in and archive

1. Open the app and click **“Archive my Classroom”**.
2. Paste your **Client ID** (only asked the first time — it’s remembered), then
   **Sign in with Google**. Approve the read-only permissions.
3. Optionally paste a single **Classroom URL** to archive just that course, and
   choose whether to **download attached Drive files**.
4. Click **Start archiving**. Watch the progress log.
5. When it finishes, click **Open in viewer** to browse it, then use **Export**
   (top-right) to save a `.zip` (with files) or a `.json` (metadata only).

---

## Sharing what you archived

From the viewer, click **Share** (top-right):

- **Share link** — for small archives, the app makes a link that contains the
  whole structure. Anyone who opens it sees your courses/assignments (metadata
  and original links only — your downloaded files are *not* embedded in a link).
- **Share the files too** — click **Export → Download .zip**, upload the `.zip`
  anywhere public (GitHub, Drive, Dropbox…), and share a link like:
  `…/#/view?src=<link-to-your-zip>`. The viewer loads it directly.

---

## Privacy

- Everything runs in your browser. Course data and files are processed locally;
  the app has no server and stores nothing about you.
- Google sign-in is **read-only** — the app can never post, edit, or delete
  anything in your Classroom or Drive.
- The access token lives in memory for the session only. Closing the tab or
  clicking **Sign out** ends it.

---

## Troubleshooting

- **“Access denied” / “app not verified.”** In the OAuth consent screen, make
  sure your account is listed under **Test users** (Testing mode), then retry.
- **Sign-in popup closes immediately / blocked.** Allow popups for the site and
  try again.
- **“Failed to load Google sign-in.”** A network/adblock issue — check your
  connection and disable content blockers for the site.
- **Sign-in works but nothing loads.** The site’s origin must be in the OAuth
  client’s **Authorized JavaScript origins** (exact scheme + host + port).
- **A few files say “unavailable.”** Some Drive items restrict downloading;
  those are skipped and noted, and still appear as links in the archive.

---

## Prefer the command line?

The original **local engine** still exists for bulk downloads and automation.
See the main [README](../README.md) and the [CLI user guide](user-guide.md).
It produces the same `master_index.json` this web viewer can open.
