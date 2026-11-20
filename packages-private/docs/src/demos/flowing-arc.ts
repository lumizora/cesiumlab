import 'cesium/Build/Cesium/Widgets/widgets.css';

import {
  buildModuleUrl,
  Cartesian3,
  Color,
  ImageryLayer,
  TileMapServiceImageryProvider,
  Viewer,
} from 'cesium';
import { createFlowingArc } from '@cesiumlab/effects';

export async function mountFlowingArc(
  container: HTMLElement,
  playing: boolean,
  signal: AbortSignal,
) {
  const imagery = await TileMapServiceImageryProvider.fromUrl(
    buildModuleUrl('Assets/Textures/NaturalEarthII'),
  );
  signal.throwIfAborted();
  const viewer = new Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    skyBox: false,
    skyAtmosphere: false,
    baseLayer: new ImageryLayer(imagery),
    shouldAnimate: playing,
  });

  try {
    viewer.scene.backgroundColor = Color.fromCssColorString('#080e16');
    const arc = createFlowingArc(viewer, {
      from: [103.82, 1.35],
      to: [139.69, 35.68],
      height: 430_000,
      duration: 4,
    });
    const resetCamera = () => {
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(138, 13, 6_700_000),
        orientation: { heading: -Math.PI / 3, pitch: (-Math.PI * 5) / 12, roll: 0 },
      });
    };
    resetCamera();

    return {
      setPlaying(value: boolean) {
        viewer.clock.shouldAnimate = value;
      },
      resetCamera,
      destroy() {
        arc.destroy();
        if (!viewer.isDestroyed()) viewer.destroy();
      },
    };
  } catch (error) {
    viewer.destroy();
    throw error;
  }
}
