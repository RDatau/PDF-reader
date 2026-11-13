import "./polyfills";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Automatically register PWA Service Worker
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New PWA content available');
  },
  onOfflineReady() {
    console.log('PWA ready for offline usage');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
