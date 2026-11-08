// CESIUM_BASE_URL must be set before any Cesium value module is evaluated.
// Keeping this import first and using only dynamic `import('cesium')` elsewhere
// avoids the static-import hoisting pitfall described in the architecture doc.
import './cesium/base-url';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/main.css';

import { createApp } from 'vue';

import App from './App.vue';

// Capture mode is used for clean visual-review screenshots: it hides the
// Playground chrome and experiment controls while keeping the real Viewer.
if (new URLSearchParams(window.location.search).get('capture') === '1') {
  document.documentElement.classList.add('capture-mode');
}

createApp(App).mount('#app');
