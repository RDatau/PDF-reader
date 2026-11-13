import "./polyfills";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const isElectronOrFile =
  typeof window !== "undefined" &&
  (Boolean((window as any).electronAPI?.isElectron) || window.location.protocol === "file:");

if (import.meta.env.PROD && !isElectronOrFile) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('New PWA content available');
    },
    onOfflineReady() {
      console.log('PWA ready for offline usage');
    },
  });
} else if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
