# Google Classroom Auto Archiver

Fully automatic, local-first Google Classroom archive engine for migration, backup, and content indexing.

API-first Google Classroom archival engine with Playwright session fallback. It discovers accessible courses, crawls topics/coursework/materials/announcements, downloads Drive assets where permitted, writes SQLite metadata, and exports `output/master_index.json` for migration into another learning platform.

## What It Does

- Crawls all Classroom courses visible to the authorized Google account.
- Reads topics, coursework, materials, announcements, due dates, descriptions, and attachments.
- Downloads accessible Google Drive files.
- Exports Google Docs, Slides, Sheets, and Drawings into portable formats.
- Saves YouTube, Forms, and external links as structured references.
- Stores metadata in SQLite and JSON.
- Resumes interrupted runs and skips completed downloads.
- Keeps credentials, tokens, logs, databases, browser sessions, and downloaded files local-only.

## System Flow

```mermaid
flowchart TD
  A[npm run engine] --> B[Preflight]
  B --> C{OAuth token exists?}
  C -- no --> D[Open Google OAuth in system browser]
  C -- yes --> E[Classroom API crawl]
  D --> E
  E --> F[Normalize courses, topics, materials, attachments]
  F --> G[SQLite metadata store]
  G --> H[Drive download/export manager]
  H --> I[Local files under output/courses]
  G --> J[master_index.json]
  I --> K[Migration-ready archive]
  J --> K
```

## Data Model

```mermaid
erDiagram
  COURSES ||--o{ TOPICS : has
  COURSES ||--o{ MATERIALS : contains
  TOPICS ||--o{ MATERIALS : groups
  MATERIALS ||--o{ ATTACHMENTS : includes

  COURSES {
    text id PK
    text name
    text teacher
    text url
  }
  TOPICS {
    text id PK
    text course_id FK
    text title
  }
  MATERIALS {
    text id PK
    text course_id FK
    text topic_id FK
    text title
    text type
    text due_date
  }
  ATTACHMENTS {
    text id PK
    text material_id FK
    text filename
    text mime_type
    text local_path
    text status
  }
```

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and adjust paths/settings.

3. Do the one manual Google Cloud setup that Google requires before first login:

   - Open the Google Cloud project you will use for this archive engine.
   - Enable **Google Classroom API** and **Google Drive API**.
   - Open **Google Auth Platform** / **OAuth consent screen**.
   - Keep the app in **Testing** mode for personal/dev use.
   - In **Audience** / **Test users**, add every Google account you may sign in with.
   - Create an OAuth client of type **Desktop app**.
   - Download the client JSON to `credentials/oauth-client.json`.

   This test-user step must happen before first login. If it is missing, Google shows:

   ```text
   Access blocked: app has not completed the Google verification process
   Error 403: access_denied
   ```

4. Run the engine:

   ```bash
   npm run engine
   ```

   On first run, the engine performs preflight checks, opens Google OAuth in your normal browser, saves the token, crawls Classroom, downloads accessible Drive files, writes SQLite, and exports JSON. On later runs it skips login and resumes the archive.

## What Happens After Login

After OAuth succeeds, the same engine run continues automatically:

- Discovers all accessible courses.
- Crawls topics, coursework, materials, announcements, and attachments.
- Downloads Drive files where your account has access.
- Exports Google Docs/Slides/Sheets into portable formats.
- Saves references for YouTube, Forms, and external links.
- Writes `database/classroom.db`.
- Writes `output/master_index.json`.
- Organizes course content under `output/courses/`.

Rerun this whenever you want to update or resume the archive:

```bash
npm run engine
```

## Commands

```bash
npm run engine        # preflight, login if needed, crawl, download, export
npm run backup        # same as engine
npm run doctor        # check local credentials/token/database setup
npm run login         # auth-only repair command
npm run crawl         # low-level crawl/download/export command
npm run export        # regenerate JSON from SQLite
npm run api           # local JSON API for future frontend work
npm run sanitize:check # verify public files do not contain obvious private data
npm run release:check # check, test, sanitize, audit
npm test              # parser/storage-safe unit tests
```

Useful crawler flags:

```bash
npm run engine -- --no-download
npm run engine -- --export-only
npm run engine -- --api-only
npm run engine -- --ui-only
```

## Output

```text
output/
  courses/
    Math_Class/
      Algebra/
        Quadratics/
          worksheet.pdf
          lesson.docx
          lesson.pdf
          assignment.json
  master_index.json
database/
  classroom.db
logs/
  archiver.log
```

## Security Notes

`GOOGLE_PASSWORD` is intentionally not used. Google accounts commonly require MFA, risk checks, and browser-bound trust state; scripting a password flow is brittle and unsafe. Run `npm run engine`, complete Google auth in the normal browser when prompted, and future runs use the local token file. Tokens and downloaded archives are ignored by git.

If you see "Couldn't sign you in. This browser or app may not be secure", close the Playwright browser and run:

```bash
npm run engine
```

Do not use the Playwright browser for Google sign-in unless you specifically need UI fallback testing.

If you see `Error 403: access_denied` and Google says the app has not completed verification, add the signing-in Google account under **Google Auth Platform** / **Audience** / **Test users**, then rerun `npm run engine`.

## Public Repo Safety

The repository is designed to be public-safe. The following are ignored by git:

- `.env`
- `credentials/*.json`
- `sessions/**`
- `database/*.db`
- `database/*.db-*`
- `logs/**`
- `output/master_index.json`
- `output/courses/**`

Before publishing, run:

```bash
npm run release:check
```

## Next Level UI

The next planned milestone is a local dashboard for choosing exactly what to download before the download phase starts.

```mermaid
flowchart LR
  A[Discover metadata] --> B[Preview archive plan]
  B --> C[Select courses, topics, materials, files]
  C --> D[Save local selection manifest]
  D --> E[Download selected assets]
  E --> F[Export migration package]
```

See [docs/ui-roadmap.md](docs/ui-roadmap.md) for the implementation plan.

## Current API Coverage

The API crawler uses:

- `courses.list`
- `courses.teachers.list`
- `courses.topics.list`
- `courses.courseWork.list`
- `courses.courseWorkMaterials.list`
- `courses.announcements.list`
- `drive.files.get`
- `drive.files.export`

Relevant official references:

- Classroom coursework list: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list
- Classroom materials list: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWorkMaterials/list
- Classroom topics list: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.topics/list
- Drive file export: https://developers.google.com/drive/api/v3/reference/files/export

The UI crawler is intentionally conservative: it can discover course cards from Classroom when API mode is unavailable, while keeping Playwright session support ready for expanding UI-only scraping later.
