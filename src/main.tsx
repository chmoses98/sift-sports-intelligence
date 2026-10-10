// Barlow is the one Sift typeface (self-hosted @fontsource; tokens.css → --font-sans). Only the four weights
// the interface uses; each weight's CSS carries latin, latin-ext and vietnamese subsets behind unicode-range,
// so a browser downloads only the subsets a page actually renders. No italics: font-synthesis is off.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
// Barlow Condensed (the same Barlow family, condensed width) for display numerals and broadcast headings only.
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles/tokens.css';
import './styles/sift.css';
import './styles/shell.css';
import './styles/surfaces.css';
import './styles/home.css';
import './styles/game.css';
import './styles/insight.css';
import './styles/props.css';
import './styles/engine.css';
import './styles/cbb.css';
import './styles/hero.css';
import './styles/broadcast.css';
import './styles/fx.css';
import './styles/fidelity-game.css';
import './styles/fidelity-home.css';
import './styles/fidelity-research.css';
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
