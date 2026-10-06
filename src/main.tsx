import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/roboto-mono/wght.css';
import './styles/tokens.css';
import './styles/sift.css';
import './styles/shell.css';
import './styles/surfaces.css';
import './styles/home.css';
import './styles/game.css';
import './styles/engine.css';
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
