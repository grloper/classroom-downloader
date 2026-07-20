import { el, clear, mount, icon } from '../util/dom.js';
import { toast } from './toast.js';
import { config } from '../../config.js';
import { GoogleSession, parseClassroomUrl } from '../scraper/googleAuth.js';
import { scrapeClassroom } from '../scraper/scrapeEngine.js';
import { buildGraph, makeArchive } from '../archive/format.js';
import { LoadedArchive } from '../archive/importer.js';

const CLIENT_ID_KEY = 'ca-client-id';

/**
 * The scraping wizard. `handlers.onComplete(loaded)` hands the finished archive
 * to the app for viewing. Everything runs client-side against Google's APIs.
 */
export function renderScraper(handlers) {
  const storedClientId = localStorage.getItem(CLIENT_ID_KEY) || '';
  const session = new GoogleSession(config.google.clientId || storedClientId);
  let running = false;
  let result = null; // { entities, files }

  const root = el('div', { class: 'wizard' });

  const accountLine = el('div', { class: 'small muted' });
  const signInBtn = el('button', { class: 'btn primary', onClick: doSignIn }, [icon('google', { size: 17 }), 'Sign in with Google']);
  const clientIdField = clientIdInput(session);

  const urlField = el('input', { type: 'url', placeholder: 'https://classroom.google.com/c/…  (optional — leave blank for all courses)' });
  const driveCheck = el('input', { type: 'checkbox', checked: true });
  const runBtn = el('button', { class: 'btn success block', disabled: true, onClick: doRun }, [icon('download', { size: 17 }), 'Start archiving']);

  const logEl = el('div', { class: 'log', style: { display: 'none' } });
  const progressWrap = el('div', { class: 'progress', style: { display: 'none' } }, el('div', { class: 'bar' }));
  const resultActions = el('div', { style: { display: 'none', marginTop: '14px' } });

  const step1 = step(1, 'Connect your Google account', 'Sign in so the app can read your Classroom. Read-only — it can never change or post anything.', [
    session.isConfigured ? null : clientIdField,
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } }, [signInBtn, accountLine])
  ].filter(Boolean));

  const step2 = step(2, 'Choose what to archive', 'Archive everything, or paste one Classroom link to limit it to a single course.', [
    el('div', { class: 'field' }, [el('label', {}, 'Classroom URL (optional)'), urlField]),
    el('label', { class: 'check' }, [driveCheck, 'Download attached Drive files (Docs, PDFs, images…) into the archive'])
  ]);

  const step3 = step(3, 'Create the archive', 'This reads your courses and packages them. Larger classes with many files take longer.', [
    runBtn, progressWrap, logEl, resultActions
  ]);

  updateStepStates();

  mount(root, [
    el('h1', {}, 'Archive my Classroom'),
    el('div', { class: 'sub' }, 'Three quick steps. Your data is processed entirely in your browser.'),
    session.isConfigured ? null : setupNotice(),
    step1, step2, step3,
    el('button', { class: 'btn ghost', style: { marginTop: '18px' }, onClick: () => location.hash = '#/' }, [icon('chevron', { size: 16 }), 'Back'])
  ].filter(Boolean));

  function updateStepStates() {
    step1.classList.toggle('done', session.isSignedIn);
    step1.classList.toggle('active', !session.isSignedIn);
    step2.classList.toggle('active', session.isSignedIn);
    step3.classList.toggle('active', session.isSignedIn);
    runBtn.disabled = !session.isSignedIn || running;
  }

  async function doSignIn() {
    const cid = session.clientId || clientIdField.querySelector('input')?.value?.trim();
    if (!cid) {
      toast('Enter your Google OAuth Client ID first.', 'error');
      return;
    }
    session.clientId = cid;
    localStorage.setItem(CLIENT_ID_KEY, cid);
    signInBtn.disabled = true;
    mount(signInBtn, [icon('spinner', { size: 17, class: 'spin' }), 'Signing in…']);
    try {
      await session.signIn();
      mount(signInBtn, [icon('check', { size: 17 }), 'Signed in']);
      signInBtn.classList.remove('primary');
      signInBtn.classList.add('success');
      accountLine.textContent = session.account ? `Connected as ${session.account}` : 'Connected';
      updateStepStates();
    } catch (err) {
      signInBtn.disabled = false;
      mount(signInBtn, [icon('google', { size: 17 }), 'Sign in with Google']);
      toast(err.message, 'error', 6000);
    }
  }

  async function doRun() {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    mount(runBtn, [icon('spinner', { size: 17, class: 'spin' }), 'Archiving…']);
    logEl.style.display = 'block';
    progressWrap.style.display = 'block';
    clear(logEl);
    const bar = progressWrap.querySelector('.bar');

    const log = (msg, cls = '') => {
      logEl.appendChild(el('div', { class: cls }, msg));
      logEl.scrollTop = logEl.scrollHeight;
    };

    try {
      result = await scrapeClassroom({
        session,
        config,
        courseFilterId: parseClassroomUrl(urlField.value),
        includeDrive: driveCheck.checked,
        onProgress: (p) => {
          if (p.phase === 'warn') log(`⚠ ${p.message}`, 'l-warn');
          else log(p.message, p.phase === 'downloaded' || p.phase === 'crawled' ? 'l-ok' : '');
          if (p.total) bar.style.width = `${Math.round((p.current / p.total) * 100)}%`;
        }
      });
      bar.style.width = '100%';

      const graph = buildGraph(result.entities);
      const archive = makeArchive(graph, {
        app: config.appName,
        appVersion: config.version,
        source: 'web-scrape',
        account: session.account
      });
      const fileMap = new Map();
      for (const [path, entry] of result.files) fileMap.set(path, entry.blob);
      const loaded = new LoadedArchive(archive, fileMap);

      log(`Done — ${archive.meta.counts.courses} courses, ${archive.meta.counts.materials} items ready.`, 'l-ok');
      mount(runBtn, [icon('check', { size: 17 }), 'Archive ready']);

      mount(resultActions, [
        el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, [
          el('button', { class: 'btn primary', onClick: () => handlers.onComplete(loaded) }, [icon('eye', { size: 16 }), 'Open in viewer'])
        ])
      ]);
      resultActions.style.display = 'block';
      toast('Archive created!', 'success');
    } catch (err) {
      log(`✕ ${err.message}`, 'l-warn');
      mount(runBtn, [icon('refresh', { size: 17 }), 'Try again']);
      runBtn.disabled = false;
      toast(err.message, 'error', 6000);
    } finally {
      running = false;
    }
  }

  return root;
}

function clientIdInput(session) {
  const input = el('input', {
    type: 'text',
    placeholder: 'xxxxxxxx.apps.googleusercontent.com',
    value: session.clientId || '',
    onInput: () => { session.clientId = input.value.trim(); }
  });
  return el('div', { class: 'field' }, [
    el('label', {}, 'Google OAuth Client ID'),
    input,
    el('div', { class: 'small muted', style: { marginTop: '6px' } }, [
      'One-time setup — see the ',
      el('a', { href: 'https://github.com/grloper/classroom-downloader/blob/main/docs/web-app-guide.md', target: '_blank', rel: 'noopener' }, 'setup guide'),
      '. The Client ID is safe to paste; it is not a secret.'
    ])
  ]);
}

function setupNotice() {
  return el('div', { class: 'notice info', style: { marginBottom: '20px' } }, [
    icon('info', { size: 18 }),
    el('div', {}, [
      'This app isn’t pre-configured with a Google Client ID. Create one for free (2 minutes) using the ',
      el('a', { href: 'https://github.com/grloper/classroom-downloader/blob/main/docs/web-app-guide.md', target: '_blank', rel: 'noopener' }, 'web app guide'),
      ', then paste it below. Or use the demo / open an existing archive with no setup at all.'
    ])
  ]);
}

function step(num, title, desc, children) {
  return el('div', { class: 'step' }, [
    el('div', { class: 'step-num' }, String(num)),
    el('div', { class: 'step-content' }, [
      el('h3', {}, title),
      el('p', {}, desc),
      ...children
    ])
  ]);
}
