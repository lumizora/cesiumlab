import type { ExperimentCleanup, ExperimentMountContext } from '../contract';
import { loadCesium } from '../cesium';

import type { Viewer } from 'cesium';

const HOME_VIEW = {
  destinationDegrees: [117, 19, 5_600_000] as const,
  pitchDegrees: -62,
};

/**
 * Neutral CesiumJS smoke test.
 *
 * - Real Viewer + WebGL output.
 * - When `VITE_CESIUM_ION_TOKEN` is configured, loads Cesium World Imagery and
 *   Cesium World Terrain; otherwise falls back to a local grid + ellipsoid.
 * - Uses both Entity and asynchronous Primitive APIs so Workers are exercised.
 * - Creates and owns its Viewer, and releases it through the returned cleanup.
 */
export async function mount(context: ExperimentMountContext): Promise<ExperimentCleanup> {
  const { container, onError } = context;
  container.replaceChildren();

  const Cesium = await loadCesium();
  const ionConfigured = Boolean(
    (window as Window & { CESIUM_ION_TOKEN?: string }).CESIUM_ION_TOKEN,
  );
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
    scene.backgroundColor = Cesium.Color.fromCssColorString('#05080c');
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1620');
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = false;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
    }
    scene.fog.enabled = false;

    // Fixed local solar time keeps the lighting (and screenshots) repeatable.
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2026-11-08T04:00:00Z');
    viewer.clock.shouldAnimate = false;

    const addLocalGrid = (target: Viewer) => {
      target.imageryLayers.addImageryProvider(
        new Cesium.GridImageryProvider({
          cells: 4,
          color: Cesium.Color.fromCssColorString('#2dd4bf').withAlpha(0.32),
          glowColor: Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.16),
          glowWidth: 3,
          backgroundColor: Cesium.Color.fromCssColorString('#07131c'),
          tileWidth: 256,
          tileHeight: 256,
        }),
      );
    };

    let imagerySource = 'local-grid';
    let terrainSource = 'ellipsoid';
    let ionStatus = ionConfigured ? 'pending' : 'disabled';

    if (ionConfigured) {
      const [imageryResult, terrainResult] = await Promise.allSettled([
        Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
        }),
        Cesium.createWorldTerrainAsync({
          requestWaterMask: true,
          requestVertexNormals: true,
        }),
      ]);

      if (imageryResult.status === 'fulfilled') {
        viewer.imageryLayers.addImageryProvider(imageryResult.value);
        imagerySource = 'cesium-world-imagery';
      } else {
        addLocalGrid(viewer);
        console.warn('[cesiumlab] Cesium ion imagery unavailable; using local grid fallback.');
      }

      if (terrainResult.status === 'fulfilled') {
        viewer.terrainProvider = terrainResult.value;
        terrainSource = 'cesium-world-terrain';
      } else {
        console.warn('[cesiumlab] Cesium ion terrain unavailable; using ellipsoid fallback.');
      }

      const ionReady = imagerySource !== 'local-grid' && terrainSource !== 'ellipsoid';
      ionStatus = ionReady ? 'ready' : imagerySource !== 'local-grid' ? 'partial' : 'fallback';
    } else {
      addLocalGrid(viewer);
    }

    container.dataset.ionStatus = ionStatus;
    container.dataset.imagerySource = imagerySource;
    container.dataset.terrainSource = terrainSource;

    const beijing = Cesium.Cartesian3.fromDegrees(116.391, 39.907, 220_000);
    const shanghai = Cesium.Cartesian3.fromDegrees(121.474, 31.23, 220_000);

    viewer.entities.add({
      name: 'Beijing',
      position: beijing,
      point: {
        pixelSize: 11,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'BEIJING',
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 3,
        pixelOffset: new Cesium.Cartesian2(0, -78),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      ellipsoid: {
        radii: new Cesium.Cartesian3(390_000, 390_000, 390_000),
        material: Cesium.Color.fromCssColorString('#5eead4').withAlpha(0.72),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#ccfbf1').withAlpha(0.9),
      },
    });

    viewer.entities.add({
      name: 'Shanghai',
      position: shanghai,
      point: {
        pixelSize: 11,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'SHANGHAI',
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.fromCssColorString('#020617'),
        outlineWidth: 3,
        pixelOffset: new Cesium.Cartesian2(0, -70),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      box: {
        dimensions: new Cesium.Cartesian3(320_000, 320_000, 320_000),
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.85),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#fef3c7').withAlpha(0.9),
      },
    });

    viewer.entities.add({
      name: 'Beijing-Shanghai link',
      polyline: {
        positions: [beijing, shanghai],
        width: 7,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.28,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
      },
    });

    const regionCorners = [
      105, 22, 2000, 126, 22, 2000, 126, 45, 2000, 105, 45, 2000, 105, 22, 2000,
    ];
    viewer.entities.add({
      name: 'Async Primitive region outline',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(regionCorners),
        width: 2,
        material: Cesium.Color.fromCssColorString('#7dd3fc').withAlpha(0.65),
        arcType: Cesium.ArcType.NONE,
      },
    });

    // Asynchronous Primitive: forces Cesium geometry Workers to load. The
    // returned geometry is computed off the main thread.
    const region = new Cesium.Primitive({
      asynchronous: true,
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        translucent: true,
      }),
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray([105, 22, 126, 22, 126, 45, 105, 45]),
          ),
          height: 2_000,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.32),
          ),
        },
      }),
    });
    scene.primitives.add(region);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        HOME_VIEW.destinationDegrees[0],
        HOME_VIEW.destinationDegrees[1],
        HOME_VIEW.destinationDegrees[2],
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(HOME_VIEW.pitchDegrees),
        roll: 0,
      },
    });
    scene.screenSpaceCameraController.minimumZoomDistance = 150_000;
    scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;

    const canvas = scene.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'CesiumJS smoke test scene');

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
      onError?.(new Error('WebGL 上下文丢失，场景已停止渲染。'));
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    cleanup = () => {
      removePostRender();
      removeRenderError();
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      delete container.dataset.sceneReady;
      delete container.dataset.ionStatus;
      delete container.dataset.imagerySource;
      delete container.dataset.terrainSource;
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
