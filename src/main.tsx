import '@fontsource-variable/archivo';
import '@fontsource-variable/big-shoulders-display';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/sift.css';
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
