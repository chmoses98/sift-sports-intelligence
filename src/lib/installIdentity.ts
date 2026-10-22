// What a Home Screen shortcut installs. Opened on v4, the page presents itself as its own app, "SIFT v4", whose launch address is
// #/v4, so the icon opens v4 whichever way the phone picks its launch address (the page address when Add to Home Screen is tapped,
// or the manifest's start_url). Everywhere else nothing changes: the manifest, the icon label and the title are SIFT's own.
// index.html runs the same selection before anything else on a #/v4 address; this keeps it right as the viewer moves between
// SIFT 2.0 and v4 inside the app, where the address changes without a page load.
export type InstallIdentity = 'v4' | 'default';

const DEFAULT_MANIFEST = 'manifest.webmanifest';
const V4_MANIFEST = 'manifest-v4.webmanifest';
export const V4_NAME = 'SIFT v4';
const DEFAULT_SHORT = 'Sift';
const DEFAULT_TITLE = 'Sift · Sports Intelligence';

export function setInstallIdentity(which: InstallIdentity, doc: Document = document): void {
  const link = doc.querySelector('link[rel="manifest"]');
  const href = link?.getAttribute('href');
  if (link && href) link.setAttribute('href', href.replace(/manifest(?:-v4)?\.webmanifest$/, which === 'v4' ? V4_MANIFEST : DEFAULT_MANIFEST));
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', which === 'v4' ? V4_NAME : DEFAULT_SHORT);
  doc.title = which === 'v4' ? `${V4_NAME} · early access` : DEFAULT_TITLE;
}

/** Running as an installed Home Screen app (no browser bar): iOS reports it on `navigator.standalone`, other browsers on the display mode. */
export function isStandalone(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}
