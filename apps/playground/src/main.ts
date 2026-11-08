// CESIUM_BASE_URL must be set before any Cesium value module is evaluated.
// Keeping this import first and using only dynamic `import('cesium')` elsewhere
// avoids the static-import hoisting pitfall described in the architecture doc.
import './cesium/base-url';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/main.css';

import { createApp } from 'vue';

import App from './App.vue';

createApp(App).mount('#app');
