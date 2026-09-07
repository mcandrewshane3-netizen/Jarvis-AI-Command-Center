import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { installAudioPlaybackUnlock } from '@/lib/audio-playback';

import './index.css';
import './cinematic.css';
import './core-first.css';

installAudioPlaybackUnlock();

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: new URL('.', document.baseURI).pathname })
      .catch((error) => console.warn('JARVIS service worker unavailable', error));
  });
}
