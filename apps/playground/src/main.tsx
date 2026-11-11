// Keep CESIUM_BASE_URL first. Experiments must continue to import Cesium dynamically.
import './cesium/base-url';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-y2k/theme.css';
import './styles/main.css';

import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { y2kTheme } from '@astryxdesign/theme-y2k/built';

import App from './App';

if (new URLSearchParams(window.location.search).get('capture') === '1') {
  document.documentElement.classList.add('capture-mode');
}

const host = document.getElementById('app');
if (!host) {
  throw new Error('Missing #app mount point');
}
// Avoid StrictMode double-mounting real CesiumJS contexts during development.
createRoot(host).render(
  <Theme theme={y2kTheme} mode="light">
    <App />
  </Theme>,
);
