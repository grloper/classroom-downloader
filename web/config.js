/**
 * Classroom Archiver — Web App configuration.
 *
 * This file is intentionally plain (no build step) so a maintainer or a
 * self-hosting user can edit it directly. Every value is optional: the app
 * runs as a zero-setup *viewer* with none of it. The Google fields are only
 * needed for the in-browser *scraper*.
 */
export const config = {
  /** Shown in the header and exported archives. */
  appName: 'Classroom Archiver',
  version: '2.0.0',

  google: {
    /**
     * OAuth 2.0 Web Client ID from Google Cloud Console.
     *
     * - Leave empty to let each user paste their own Client ID in the UI.
     * - Set it once (and add your GitHub Pages origin to the client's
     *   "Authorized JavaScript origins") to give users true one-click sign-in.
     *
     * The Client ID is NOT a secret — it is safe to commit and ship in a
     * public static site. No client secret is ever used in the browser flow.
     */
    clientId: '',

    /** Read-only scopes. Mirrors the Node engine so both produce identical data. */
    scopes: [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
      'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
      'https://www.googleapis.com/auth/classroom.announcements.readonly',
      'https://www.googleapis.com/auth/classroom.topics.readonly',
      'https://www.googleapis.com/auth/classroom.rosters.readonly',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  },

  /** Course states to include when scraping. */
  courseStates: ['ACTIVE', 'ARCHIVED'],

  /** A shareable archive embedded directly in a link must stay under this size. */
  maxInlineShareBytes: 1_500_000
};

export default config;
