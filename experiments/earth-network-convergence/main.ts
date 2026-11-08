import type { ExperimentCleanup, ExperimentMountContext } from '../contract';
import { loadCesium } from '../cesium';

import boundaryUrl from './assets/china-boundary.geojson?url';
import provinceUrl from './assets/china-provinces.geojson?url';
import nightEarthUrl from './assets/night-earth.jpg?url';
import './controls.css';
import { createControls, type ControlsHandle } from './controls';
import { createNetworkScene, type NetworkScene, type NetworkState } from './network';

import type { Viewer } from 'cesium';

const HOME_VIEW = {
  target: [108, 26] as const,
  headingDegrees: 338,
  pitchDegrees: -55,
  range: 5_900_000,
};

const DEFAULT_STATE: NetworkState = {
  routeColor: '#ffa31a',
  nodeColor: '#00a8ff',
  routeSpeed: 1,
  pulseSpeed: 1,
  glowIntensity: 1,
  showBorders: true,
};

export async function mount(context: ExperimentMountContext): Promise<ExperimentCleanup> {
  const { container, onError } = context;
  container.replaceChildren();

  const Cesium = await loadCesium();
  let viewer: Viewer | undefined;
  let cleanup: ExperimentCleanup | undefined;

  try {
    viewer = new Cesium.Viewer(container, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      sceneModePicker: false,
      selectionIndicator: false,
      shouldAnimate: false,
      timeline: false,
      requestRenderMode: false,
      contextOptions: {
        webgl: {
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: true,
        },
      },
    });

    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.fromCssColorString('#01040b');
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#020a14');
    scene.globe.enableLighting = false;
    scene.globe.depthTestAgainstTerrain = false;
    scene.globe.showGroundAtmosphere = false;
    scene.fog.enabled = false;
    if (scene.sun) {
      scene.sun.show = false;
    }
    if (scene.moon) {
      scene.moon.show = false;
    }
    if (scene.skyBox) {
      scene.skyBox.show = true;
    }
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.hueShift = 0;
      scene.skyAtmosphere.saturationShift = 0.2;
      scene.skyAtmosphere.brightnessShift = 0.12;
      scene.skyAtmosphere.atmosphereLightIntensity = 12;
    }

    const nightProvider = await Cesium.SingleTileImageryProvider.fromUrl(nightEarthUrl, {
      credit: new Cesium.Credit(
        'Night lights: NASA Black Marble, via three-globe example asset (MIT repository)',
        false,
      ),
    });
    const nightLayer = viewer.imageryLayers.addImageryProvider(nightProvider);
    nightLayer.brightness = 1.28;
    nightLayer.contrast = 1.12;
    nightLayer.saturation = 0.95;
    nightLayer.gamma = 1.08;
    nightLayer.hue = 0.01;

    if (window.CESIUM_ION_TOKEN) {
      try {
        viewer.terrainProvider = await Cesium.createWorldTerrainAsync({
          requestVertexNormals: true,
        });
        container.dataset.terrain = 'world-terrain';
      } catch {
        container.dataset.terrain = 'ellipsoid';
        console.warn('[cesiumlab] Cesium World Terrain unavailable; using ellipsoid terrain.');
      }
    } else {
      container.dataset.terrain = 'ellipsoid';
    }
    container.dataset.imagery = 'night-lights-4096';

    const state: NetworkState = { ...DEFAULT_STATE };
    const network: NetworkScene = await createNetworkScene(
      Cesium,
      viewer,
      state,
      boundaryUrl,
      provinceUrl,
    );

    const bloom = scene.postProcessStages.bloom;
    bloom.enabled = true;
    bloom.uniforms.glowOnly = false;
    bloom.uniforms.contrast = 128;
    bloom.uniforms.delta = 1;
    bloom.uniforms.sigma = 2.2;
    bloom.uniforms.stepSize = 1;
    const applyGlow = () => {
      state.glowIntensity = Math.max(0, state.glowIntensity);
      bloom.enabled = state.glowIntensity > 0.01;
      bloom.uniforms.brightness = -0.5 + state.glowIntensity * 0.2;
      bloom.uniforms.sigma = 1.1 + state.glowIntensity * 0.8;
    };
    applyGlow();

    const setHomeView = () => {
      viewer?.camera.lookAt(
        Cesium.Cartesian3.fromDegrees(HOME_VIEW.target[0], HOME_VIEW.target[1], 0),
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(HOME_VIEW.headingDegrees),
          Cesium.Math.toRadians(HOME_VIEW.pitchDegrees),
          HOME_VIEW.range,
        ),
      );
      viewer?.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    };
    setHomeView();

    scene.screenSpaceCameraController.minimumZoomDistance = 600_000;
    scene.screenSpaceCameraController.maximumZoomDistance = 24_000_000;

    let controls: ControlsHandle | null = null;
    const resetShowcase = () => {
      Object.assign(state, DEFAULT_STATE);
      network.setShowBorders(state.showBorders);
      network.restart();
      applyGlow();
      setHomeView();
      controls?.sync();
      container.dataset.resetCount = String(Number(container.dataset.resetCount ?? '0') + 1);
    };

    controls = createControls(container, state, network, {
      onGlowChange: applyGlow,
      onReset: resetShowcase,
    });

    const canvas = scene.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Earth Network Convergence 3D scene');

    container.dataset.experiment = 'earth-network-convergence';
    container.dataset.stage2State = 'awaiting-visual-review';
    container.dataset.routeCount = String(network.counts.routes);
    container.dataset.nodeCount = String(network.counts.nodes);
    container.dataset.borderLines = String(network.counts.borderLines);
    container.dataset.provinceLines = String(network.counts.provinceLines);
    container.dataset.showBorders = String(state.showBorders);
    container.dataset.resetCount = '0';

    const removePostRender = scene.postRender.addEventListener(() => {
      if (container.dataset.sceneReady !== 'true') {
        container.dataset.sceneReady = 'true';
      }
    });

    const removeRenderError = scene.renderError.addEventListener((_scene, error) => {
      onError?.(error);
    });

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onError?.(new Error('WebGL 上下文丢失，Earth Network 场景已停止渲染。'));
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    cleanup = () => {
      removePostRender();
      removeRenderError();
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      controls?.destroy();
      network.destroy();
      delete container.dataset.sceneReady;
      delete container.dataset.experiment;
      delete container.dataset.stage2State;
      delete container.dataset.routeCount;
      delete container.dataset.nodeCount;
      delete container.dataset.borderLines;
      delete container.dataset.provinceLines;
      delete container.dataset.showBorders;
      delete container.dataset.resetCount;
      delete container.dataset.terrain;
      delete container.dataset.imagery;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      container.replaceChildren();
    };

    return cleanup;
  } catch (error) {
    cleanup?.();
    if (viewer && !viewer.isDestroyed()) {
      viewer.destroy();
    }
    container.replaceChildren();
    throw error;
  }
}
