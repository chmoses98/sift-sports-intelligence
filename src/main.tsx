// Barlow is the one Sift typeface (self-hosted @fontsource; tokens.css → --font-sans). Only the four weights
// the interface uses; each weight's CSS carries latin, latin-ext and vietnamese subsets behind unicode-range,
// so a browser downloads only the subsets a page actually renders. No italics: font-synthesis is off.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import './styles/tokens.css';
import './styles/sift.css';
import './styles/shell.css';
import './styles/surfaces.css';
import './styles/home.css';
import './styles/game.css';
import './styles/insight.css';
import './styles/engine.css';
import './styles/cbb.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable PWA: the service worker precaches the app shell and caches research data you open.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
