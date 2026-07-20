/** Lazy-load third-party browser libraries from CDN, only when first needed. */

const JSZIP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
let jsZipLoading = null;

export function loadJsZip() {
  if (typeof window !== 'undefined' && window.JSZip) return Promise.resolve(window.JSZip);
  if (jsZipLoading) return jsZipLoading;
  jsZipLoading = loadScript(JSZIP_SRC)
    .then(() => {
      if (!window.JSZip) throw new Error('Zip library failed to initialize.');
      return window.JSZip;
    })
    .catch((err) => {
      jsZipLoading = null;
      throw err;
    });
  return jsZipLoading;
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}. Check your connection.`));
    document.head.appendChild(script);
  });
}
