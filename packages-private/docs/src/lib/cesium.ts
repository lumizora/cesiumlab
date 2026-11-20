import 'cesium/Build/Cesium/Widgets/widgets.css';

import {
  buildModuleUrl,
  Color,
  ImageryLayer,
  Ion,
  Terrain,
  TileMapServiceImageryProvider,
  Viewer,
} from 'cesium';

export interface CreateDocsViewerOptions {
  shouldAnimate?: boolean;
  /** Enable Cesium World Terrain when CESIUM_ION_TOKEN is configured. Defaults to true. */
  terrain?: boolean;
}

export function hasCesiumIonToken(): boolean {
  return Boolean(import.meta.env.CESIUM_ION_TOKEN?.trim());
}

/**
 * Creates a CesiumJS Viewer configured for docs demos.
 * Uses Cesium ion World Imagery and World Terrain when `CESIUM_ION_TOKEN` is provided,
 * and falls back to the bundled Natural Earth II imagery otherwise.
 */
export async function createDocsViewer(
  container: HTMLElement,
  signal: AbortSignal,
  options: CreateDocsViewerOptions = {},
): Promise<Viewer> {
  const { shouldAnimate = true, terrain = true } = options;
  const token = import.meta.env.CESIUM_ION_TOKEN?.trim();

  let baseLayer: ImageryLayer;
  let terrainProvider: Terrain | undefined;

  if (token) {
    Ion.defaultAccessToken = token;
    baseLayer = ImageryLayer.fromWorldImagery({});
    if (terrain) {
      terrainProvider = Terrain.fromWorldTerrain({
        requestVertexNormals: true,
      });
    }
  } else {
    const imagery = await TileMapServiceImageryProvider.fromUrl(
      buildModuleUrl('Assets/Textures/NaturalEarthII'),
    );
    signal.throwIfAborted();
    baseLayer = new ImageryLayer(imagery);
  }

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
    baseLayer,
    terrain: terrainProvider,
    shouldAnimate,
  });

  viewer.scene.backgroundColor = Color.fromCssColorString('#080e16');
  return viewer;
}
