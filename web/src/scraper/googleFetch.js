/**
 * Authorized fetch against Google REST APIs with one automatic token refresh
 * on 401 and a light retry/backoff for transient (429/5xx) errors.
 */

export async function googleFetch(session, url, { responseType = 'json', retries = 4, signal } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const token = await session.getToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal
    });

    if (res.status === 401 && attempt === 0) {
      // Token likely expired mid-run — force a refresh and retry once.
      session.accessToken = null;
      session.expiresAt = 0;
      attempt += 1;
      continue;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Math.min(1000 * 2 ** attempt, 8000);
      await sleep(wait);
      attempt += 1;
      continue;
    }

    if (!res.ok) {
      const message = await extractError(res);
      throw new Error(message);
    }

    if (responseType === 'blob') return res.blob();
    if (responseType === 'text') return res.text();
    if (responseType === 'response') return res;
    return res.json();
  }
}

async function extractError(res) {
  try {
    const body = await res.json();
    const msg = body?.error?.message || body?.error_description || res.statusText;
    return `Google API error ${res.status}: ${msg}`;
  } catch {
    return `Google API error ${res.status}: ${res.statusText}`;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
