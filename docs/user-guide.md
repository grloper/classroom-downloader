# Classroom Downloader User Guide

This is the no-coding path for people who only want to download and archive their Google Classroom content.

## What You Download

Use the file for your computer:

- Windows: `classroom-downloader-win.exe`
- macOS: `classroom-downloader-mac`
- Linux: `classroom-downloader-linux`

Put the file in its own empty folder, then run it. The app creates these folders next to the executable:

- `credentials` for the Google OAuth file
- `sessions` for your local Google token
- `database` for the local index
- `output` for downloaded Classroom files
- `logs` for troubleshooting

## One-Time Google Setup

Google does not allow this project to ship a shared login key. Each user or school must create their own OAuth Desktop app once.

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable Google Classroom API.
4. Enable Google Drive API.
5. Open Google Auth Platform, then OAuth consent screen.
6. Keep the app in Testing mode for personal use.
7. Add the Google account you will sign in with as a Test user.
8. Create an OAuth client with application type Desktop app.
9. Download the JSON file.

## First Run

1. Run the Classroom Downloader executable.
2. Your browser opens the local dashboard at `http://127.0.0.1:4317`.
3. Open `CONFIG`.
4. In `GOOGLE_AUTH`, choose `UPLOAD_OAUTH_JSON`.
5. Select the OAuth JSON file you downloaded from Google.
6. Open `DL_PLAN`.
7. Choose `SYNC_METADATA`.
8. Complete Google sign-in in your normal browser.
9. Review what will be downloaded.
10. Choose `COMMIT_PLAN`, then `INIT_DOWNLOAD`.

The first login saves a token under `sessions`. Later runs reuse that token and resume skipped downloads automatically.

## Where Files Go

Downloaded files are saved under:

```text
output/courses/
```

The migration index is saved at:

```text
output/master_index.json
```

The local database is saved at:

```text
database/classroom.db
```

## Troubleshooting

If Google says `access_denied` or the app is not verified, add the signing-in account under Google Auth Platform, Audience, Test users, then run the downloader again.

If Windows SmartScreen warns about the executable, choose More info, then Run anyway only if you downloaded it from this repository's GitHub Releases page.

If the dashboard opens but downloads do not start, keep the terminal window open. It shows the login, crawl, and download progress.

All credentials, tokens, logs, databases, and downloaded files stay on your computer.
