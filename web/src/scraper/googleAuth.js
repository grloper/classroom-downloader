/**
 * Browser-side Google authorization using Google Identity Services (GIS).
 *
 * This replaces the Node engine's Desktop-app OAuth client + loopback server +
 * JSON upload. The user clicks "Sign in with Google" and GIS returns a
 * short-lived access token entirely in the browser. No client secret, no
 * server, no files. The only prerequisite is an OAuth *Web* Client ID whose
 * "Authorized JavaScript origins" include this site's origin.
 */
import { config } from '../../config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoading = null;

/** Load the GIS client library once. */
export function loadGis() {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in.')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in. Check your connection.'));
    document.head.appendChild(script);
  });
  return gisLoading;
}

/** Extract a course id hint from a pasted Classroom URL (optional convenience). */
export function parseClassroomUrl(url) {
  if (!url) return null;
  const match = String(url).match(/classroom\.google\.com\/(?:u\/\d+\/)?c\/([\w-]+)/i);
  return match ? match[1] : null;
}

export class GoogleSession {
  constructor(clientId = config.google.clientId, scopes = config.google.scopes) {
    this.clientId = clientId;
    this.scopes = scopes;
    this.tokenClient = null;
    this.accessToken = null;
    this.expiresAt = 0;
    this.account = null;
  }

  get isConfigured() {
    return Boolean(this.clientId);
  }

  get isSignedIn() {
    return Boolean(this.accessToken) && Date.now() < this.expiresAt - 30_000;
  }

  async init() {
    if (!this.clientId) throw new Error('No Google OAuth Client ID configured.');
    await loadGis();
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      callback: () => {} // replaced per-request in requestToken()
    });
  }

  /** Interactively request (or silently refresh) an access token. */
  requestToken({ prompt = '' } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error('Google session not initialized.'));
        return;
      }
      this.tokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(describeTokenError(response)));
          return;
        }
        this.accessToken = response.access_token;
        this.expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
        resolve(this.accessToken);
      };
      try {
        this.tokenClient.requestAccessToken({ prompt });
      } catch (err) {
        reject(err);
      }
    });
  }

  async signIn() {
    if (!this.tokenClient) await this.init();
    // Force the consent/account chooser on first sign-in.
    await this.requestToken({ prompt: this.accessToken ? '' : 'consent' });
    await this.loadProfile().catch(() => {});
    return this.accessToken;
  }

  async getToken() {
    if (this.isSignedIn) return this.accessToken;
    if (!this.tokenClient) await this.init();
    return this.requestToken({ prompt: '' });
  }

  /** Best-effort account email for display + archive metadata. */
  async loadProfile() {
    const token = this.accessToken;
    if (!token) return null;
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      this.account = data.email || data.name || null;
    }
    return this.account;
  }

  signOut() {
    const token = this.accessToken;
    this.accessToken = null;
    this.expiresAt = 0;
    this.account = null;
    if (token && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(token, () => {});
      } catch {
        /* ignore */
      }
    }
  }
}

function describeTokenError(response) {
  const err = response.error;
  if (err === 'popup_closed' || err === 'popup_failed_to_open') {
    return 'Sign-in was cancelled or the popup was blocked. Allow popups and try again.';
  }
  if (err === 'access_denied') {
    return 'Access denied. If the app is in Testing mode, your account must be added as a Test user.';
  }
  return response.error_description || `Google sign-in failed (${err}).`;
}
