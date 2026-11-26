import {
  Cartesian3,
  Cartesian4,
  Color,
  CustomShader,
  CustomShaderTranslucencyMode,
  LightingModel,
  Matrix4,
  Transforms,
  UniformType,
  type Cesium3DTileset,
  type Model,
  type Viewer,
} from '@cesiumlab/cesium';
import { createAnimationClock } from '../shared/clock.ts';
import type { EffectBaseOptions, EffectHandle } from '../shared/effect.ts';
import {
  resolveColor,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export type BuildingStylePreset = 'cyber' | 'holo' | 'night-glow' | 'thermal';

export type BuildingStyleTarget = Cesium3DTileset | Model;

export interface BuildingStyleOptions extends EffectBaseOptions {
  /** Target `Cesium3DTileset` (e.g. OSM Buildings) or `Model` to apply the shader to. */
  tileset: BuildingStyleTarget;
  /**
   * Reference geographic coordinate `[longitude, latitude]` used to establish the local ENU
   * vertical axis for accurate height gradients and window grids. Defaults to the tileset's
   * bounding sphere center when available.
   */
  referencePosition?: LngLat;
  /** Style preset (`'cyber' | 'holo' | 'night-glow' | 'thermal'`). Defaults to `'cyber'`. */
  preset?: BuildingStylePreset;
  /** Lower facade base color. Overrides preset default when provided. */
  baseColor?: ColorInput;
  /** Upper facade & rooftop color. Overrides preset default when provided. */
  topColor?: ColorInput;
  /** Rising holographic scan halo color. Overrides preset default when provided. */
  scanColor?: ColorInput;
  /** Procedural facade window light color. Overrides preset default when provided. */
  windowColor?: ColorInput;
  /** Reference ground altitude in metres (subtracted from local ENU Z). Defaults to 0. */
  baseElevation?: number;
  /** Height normalization ceiling in metres for the vertical color gradient. Defaults to 240. */
  maxHeight?: number;
  /** Rising scan ring speed multiplier (`0` disables the scan ring). Defaults to 1. */
  scanSpeed?: number;
  /** Vertical thickness of the rising scan ring in metres. Defaults to 18. */
  scanWidth?: number;
  /** Procedural zero-texture facade window light intensity (0 to 1.5). Defaults to 0.75. */
  windowGlow?: number;
  /** Rooftop & upper crown rim highlight intensity (0 to 1.5). Defaults to 0.85. */
  roofHighlight?: number;
  /** Overall opacity (0.2 to 1). Defaults to 1. */
  opacity?: number;
}

export type BuildingStyleUpdateOptions = Partial<
  Pick<
    BuildingStyleOptions,
    | 'referencePosition'
    | 'preset'
    | 'baseColor'
    | 'topColor'
    | 'scanColor'
    | 'windowColor'
    | 'baseElevation'
    | 'maxHeight'
    | 'scanSpeed'
    | 'scanWidth'
    | 'windowGlow'
    | 'roofHighlight'
    | 'opacity'
  >
>;

export type BuildingStyleHandle = EffectHandle<BuildingStyleUpdateOptions>;

interface PresetPalette {
  baseColor: Color;
  topColor: Color;
  scanColor: Color;
  windowColor: Color;
  modeIndex: number;
}

const PRESET_PALETTES: Record<BuildingStylePreset, PresetPalette> = {
  cyber: {
    baseColor: Color.fromCssColorString('#0a1633'),
    topColor: Color.fromCssColorString('#00c8ff'),
    scanColor: Color.fromCssColorString('#38f9ff'),
    windowColor: Color.fromCssColorString('#7dd3fc'),
    modeIndex: 0,
  },
  holo: {
    baseColor: Color.fromCssColorString('#062436'),
    topColor: Color.fromCssColorString('#22d3ee'),
    scanColor: Color.fromCssColorString('#a5f3fc'),
    windowColor: Color.fromCssColorString('#67e8f9'),
    modeIndex: 1,
  },
  'night-glow': {
    baseColor: Color.fromCssColorString('#111827'),
    topColor: Color.fromCssColorString('#334155'),
    scanColor: Color.fromCssColorString('#60a5fa'),
    windowColor: Color.fromCssColorString('#fbbf24'),
    modeIndex: 2,
  },
  thermal: {
    baseColor: Color.fromCssColorString('#1e0836'),
    topColor: Color.fromCssColorString('#fb923c'),
    scanColor: Color.fromCssColorString('#fde047'),
    windowColor: Color.fromCssColorString('#f43f5e'),
    modeIndex: 3,
  },
};

const BUILDING_FRAGMENT_SHADER = /* glsl */ `
float cs_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 posEC = fsInput.attributes.positionEC;
  vec3 nEC = normalize(fsInput.attributes.normalEC);

  // High-precision local ENU coordinates relative to the urban anchor (works on any 3D Tileset / glTF).
  vec3 relEC = posEC - u_centerEC;
  vec3 enu = vec3(
    dot(relEC, u_eastEC),
    dot(relEC, u_northEC),
    dot(relEC, u_upEC)
  );
  vec3 normalENU = normalize(vec3(
    dot(nEC, u_eastEC),
    dot(nEC, u_northEC),
    dot(nEC, u_upEC)
  ));

  float h = max(0.0, enu.z - u_baseElevation);
  float hNorm = clamp(h / max(1.0, u_maxHeight), 0.0, 1.0);

  float isRoof = smoothstep(0.68, 0.92, normalENU.z);
  float isWall = 1.0 - isRoof;

  // Directional urban rim lighting for crisp architectural volume
  vec3 sunDir = normalize(vec3(0.42, 0.55, 0.72));
  float facadeLight = mix(0.66, 1.18, clamp(dot(normalENU, sunDir) * 0.5 + 0.5, 0.0, 1.0));
  vec3 viewDirEC = normalize(-posEC);
  float fresnel = pow(clamp(1.0 - abs(dot(nEC, viewDirEC)), 0.0, 1.0), 2.2);

  // Base vertical gradient
  vec3 gradColor = mix(u_baseColor.rgb, u_topColor.rgb, pow(hNorm, 0.72)) * facadeLight;

  // Procedural zero-texture facade window matrix (4.2 m floor x 3.4 m bay)
  float windowSignal = 0.0;
  if (u_windowGlow > 0.01 && isWall > 0.05) {
    float wallU = abs(normalENU.x) > abs(normalENU.y) ? enu.y : enu.x;
    vec2 cell = vec2(floor(wallU / 3.4), floor(h / 4.2));
    vec2 local = vec2(fract(wallU / 3.4), fract(h / 4.2));

    // Crisp window pane inside dark mullions (skip ground lobby floor < 5 m)
    float paneX = step(0.16, local.x) * step(local.x, 0.84);
    float paneY = step(0.24, local.y) * step(local.y, 0.78);
    float aboveGround = smoothstep(3.5, 7.0, h);

    float rnd = cs_hash12(cell + vec2(floor(enu.x / 60.0) * 13.7, floor(enu.y / 60.0) * 7.3));
    float floorBand = cs_hash12(vec2(cell.y, floor(enu.x / 40.0) + floor(enu.y / 40.0)));
    float litProb = u_presetMode > 1.5 && u_presetMode < 2.5 ? 0.52 : 0.42;
    float isLit = step(1.0 - litProb, rnd * 0.75 + floorBand * 0.25);

    // Subtle slow shimmer on a few active windows
    float twinkle = 0.78 + 0.22 * sin(u_time * 1.4 + rnd * 25.0);
    windowSignal = paneX * paneY * isLit * aboveGround * twinkle * isWall * (0.45 + 0.55 * rnd);
  }

  // Holographic preset adds crisp horizontal floor grid lines
  float holoGrid = 0.0;
  if (u_presetMode > 0.5 && u_presetMode < 1.5) {
    float floorLine = 1.0 - smoothstep(0.0, 0.14, abs(fract(h / 8.0) - 0.5));
    holoGrid = (floorLine * isWall * 0.5 + fresnel * 0.65);
  }

  // Rising holographic scan halo sweeping vertically up the skyline
  float scanBand = 0.0;
  if (u_scanSpeed > 0.001) {
    float cycleH = max(40.0, u_maxHeight * 1.25);
    float scanZ = mod(u_time * u_scanSpeed * 44.0, cycleH);
    float distToScan = abs(h - scanZ);
    float width = max(2.0, u_scanWidth);
    scanBand = exp(-pow(distToScan / width, 2.0));
  }

  // Rooftop & upper silhouette crown highlight
  float roofGlow = isRoof * (0.35 + 0.65 * hNorm) * u_roofHighlight;
  float rimGlow = fresnel * (0.25 + 0.45 * hNorm) * u_roofHighlight;

  vec3 finalRgb =
    gradColor +
    u_windowColor.rgb * (windowSignal * u_windowGlow * 0.95) +
    u_topColor.rgb * (roofGlow * 0.55 + rimGlow * 0.45 + holoGrid * 0.55) +
    u_scanColor.rgb * (scanBand * (0.85 + 0.45 * isWall));

  material.diffuse = vec3(0.0);
  material.emissive = finalRgb;
  material.alpha = clamp(u_opacity, 0.2, 1.0);
}
`;

function resolveTilesetCenter(
  viewer: Viewer,
  tileset: BuildingStyleTarget,
  referencePosition?: LngLat,
): Cartesian3 {
  const ellipsoid = viewer.scene.globe?.ellipsoid;
  if (referencePosition) {
    return Cartesian3.fromDegrees(referencePosition[0], referencePosition[1], 0, ellipsoid);
  }
  const bs = (tileset as { boundingSphere?: { center?: Cartesian3 } }).boundingSphere;
  if (bs?.center && Cartesian3.magnitude(bs.center) > 1) {
    return Cartesian3.clone(bs.center);
  }
  // Fallback to Shanghai Lujiazui if boundingSphere is not ready yet
  return Cartesian3.fromDegrees(121.5016, 31.2397, 0, ellipsoid);
}

/**
 * Applies a pure-GPU zero-texture cyber/holographic `CustomShader` to any `Cesium3DTileset`
 * (such as OSM Buildings) or `Model`, featuring height gradients, rising scan halos,
 * procedural night window lighting, and rooftop rim glow. Restores the prior shader on teardown.
 */
export function createBuildingStyle(
  viewer: Viewer,
  options: BuildingStyleOptions,
): BuildingStyleHandle {
  const tileset = options.tileset;
  if (!tileset) {
    throw new RangeError('Expected tileset to be a valid Cesium3DTileset or Model.');
  }
  if (options.referencePosition !== undefined) {
    validateLngLat(options.referencePosition, 'referencePosition');
  }

  const initialPreset: BuildingStylePreset = options.preset ?? 'cyber';
  const presetDefaults = PRESET_PALETTES[initialPreset];

  const customFlags = {
    baseColor: options.baseColor !== undefined,
    topColor: options.topColor !== undefined,
    scanColor: options.scanColor !== undefined,
    windowColor: options.windowColor !== undefined,
  };

  const state = {
    referencePosition: options.referencePosition,
    preset: initialPreset,
    baseColor: resolveColor(options.baseColor, presetDefaults.baseColor),
    topColor: resolveColor(options.topColor, presetDefaults.topColor),
    scanColor: resolveColor(options.scanColor, presetDefaults.scanColor),
    windowColor: resolveColor(options.windowColor, presetDefaults.windowColor),
    baseElevation: options.baseElevation ?? 0,
    maxHeight: options.maxHeight ?? 240,
    scanSpeed: options.scanSpeed ?? 1,
    scanWidth: options.scanWidth ?? 18,
    windowGlow: options.windowGlow ?? 0.75,
    roofHighlight: options.roofHighlight ?? 0.85,
    opacity: options.opacity ?? 1,
    time: 0,
  };

  if (!Number.isFinite(state.baseElevation)) {
    throw new RangeError('Expected baseElevation to be a finite number.');
  }
  validatePositiveFinite(state.maxHeight, 'maxHeight');
  validateNonNegativeFinite(state.scanSpeed, 'scanSpeed');
  validatePositiveFinite(state.scanWidth, 'scanWidth');
  validateNonNegativeFinite(state.windowGlow, 'windowGlow');
  validateNonNegativeFinite(state.roofHighlight, 'roofHighlight');
  validatePositiveFinite(state.opacity, 'opacity');

  const centerECEF = new Cartesian3();
  const eastECEF = new Cartesian3();
  const northECEF = new Cartesian3();
  const upECEF = new Cartesian3();
  const enuMatrix = new Matrix4();
  const colScratch = new Cartesian4();

  const centerEC = new Cartesian3();
  const eastEC = new Cartesian3(1, 0, 0);
  const northEC = new Cartesian3(0, 1, 0);
  const upEC = new Cartesian3(0, 0, 1);

  const rebuildOriginFrame = () => {
    const ellipsoid = viewer.scene.globe?.ellipsoid;
    const anchor = resolveTilesetCenter(viewer, tileset, state.referencePosition);
    Cartesian3.clone(anchor, centerECEF);
    Transforms.eastNorthUpToFixedFrame(centerECEF, ellipsoid, enuMatrix);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 0, colScratch), eastECEF);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 1, colScratch), northECEF);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 2, colScratch), upECEF);
    Cartesian3.normalize(eastECEF, eastECEF);
    Cartesian3.normalize(northECEF, northECEF);
    Cartesian3.normalize(upECEF, upECEF);
  };

  rebuildOriginFrame();

  const customShader = new CustomShader({
    lightingModel: LightingModel.UNLIT,
    translucencyMode:
      state.opacity < 0.99
        ? CustomShaderTranslucencyMode.TRANSLUCENT
        : CustomShaderTranslucencyMode.OPAQUE,
    uniforms: {
      u_time: { type: UniformType.FLOAT, value: 0 },
      u_presetMode: { type: UniformType.FLOAT, value: presetDefaults.modeIndex },
      u_baseColor: { type: UniformType.VEC4, value: state.baseColor },
      u_topColor: { type: UniformType.VEC4, value: state.topColor },
      u_scanColor: { type: UniformType.VEC4, value: state.scanColor },
      u_windowColor: { type: UniformType.VEC4, value: state.windowColor },
      u_baseElevation: { type: UniformType.FLOAT, value: state.baseElevation },
      u_maxHeight: { type: UniformType.FLOAT, value: state.maxHeight },
      u_scanSpeed: { type: UniformType.FLOAT, value: state.scanSpeed },
      u_scanWidth: { type: UniformType.FLOAT, value: state.scanWidth },
      u_windowGlow: { type: UniformType.FLOAT, value: state.windowGlow },
      u_roofHighlight: { type: UniformType.FLOAT, value: state.roofHighlight },
      u_opacity: { type: UniformType.FLOAT, value: state.opacity },
      u_centerEC: { type: UniformType.VEC3, value: centerEC },
      u_eastEC: { type: UniformType.VEC3, value: eastEC },
      u_northEC: { type: UniformType.VEC3, value: northEC },
      u_upEC: { type: UniformType.VEC3, value: upEC },
    },
    fragmentShaderText: BUILDING_FRAGMENT_SHADER,
  });

  const previousShader = tileset.customShader;
  let visible = options.show ?? true;
  let destroyed = false;

  const syncShaderAttachment = () => {
    if (tileset.isDestroyed?.()) return;
    tileset.customShader = visible ? customShader : previousShader;
  };

  syncShaderAttachment();

  const updateEyeBasis = () => {
    const viewMatrix = viewer.camera?.viewMatrix;
    if (!viewMatrix) return;
    Matrix4.multiplyByPoint(viewMatrix, centerECEF, centerEC);
    Matrix4.multiplyByPointAsVector(viewMatrix, eastECEF, eastEC);
    Matrix4.multiplyByPointAsVector(viewMatrix, northECEF, northEC);
    Matrix4.multiplyByPointAsVector(viewMatrix, upECEF, upEC);
    Cartesian3.normalize(eastEC, eastEC);
    Cartesian3.normalize(northEC, northEC);
    Cartesian3.normalize(upEC, upEC);
    customShader.setUniform('u_centerEC', centerEC);
    customShader.setUniform('u_eastEC', eastEC);
    customShader.setUniform('u_northEC', northEC);
    customShader.setUniform('u_upEC', upEC);
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    state.time = elapsedSeconds;
    customShader.setUniform('u_time', elapsedSeconds);
    updateEyeBasis();
  });

  const setVisible = (nextVisible: boolean) => {
    if (destroyed) return;
    visible = nextVisible;
    syncShaderAttachment();
  };

  return {
    show() {
      setVisible(true);
    },
    hide() {
      setVisible(false);
    },
    setVisible,
    isVisible() {
      return !destroyed && visible;
    },
    update(next) {
      if (destroyed) return;
      if (next.referencePosition !== undefined) {
        validateLngLat(next.referencePosition, 'referencePosition');
        state.referencePosition = next.referencePosition;
        rebuildOriginFrame();
      }
      if (next.preset !== undefined && next.preset !== state.preset) {
        state.preset = next.preset;
        const p = PRESET_PALETTES[state.preset];
        customShader.setUniform('u_presetMode', p.modeIndex);
        if (!customFlags.baseColor && next.baseColor === undefined) {
          state.baseColor = p.baseColor;
          customShader.setUniform('u_baseColor', state.baseColor);
        }
        if (!customFlags.topColor && next.topColor === undefined) {
          state.topColor = p.topColor;
          customShader.setUniform('u_topColor', state.topColor);
        }
        if (!customFlags.scanColor && next.scanColor === undefined) {
          state.scanColor = p.scanColor;
          customShader.setUniform('u_scanColor', state.scanColor);
        }
        if (!customFlags.windowColor && next.windowColor === undefined) {
          state.windowColor = p.windowColor;
          customShader.setUniform('u_windowColor', state.windowColor);
        }
      }
      if (next.baseColor !== undefined) {
        customFlags.baseColor = true;
        state.baseColor = resolveColor(next.baseColor, PRESET_PALETTES[state.preset].baseColor);
        customShader.setUniform('u_baseColor', state.baseColor);
      }
      if (next.topColor !== undefined) {
        customFlags.topColor = true;
        state.topColor = resolveColor(next.topColor, PRESET_PALETTES[state.preset].topColor);
        customShader.setUniform('u_topColor', state.topColor);
      }
      if (next.scanColor !== undefined) {
        customFlags.scanColor = true;
        state.scanColor = resolveColor(next.scanColor, PRESET_PALETTES[state.preset].scanColor);
        customShader.setUniform('u_scanColor', state.scanColor);
      }
      if (next.windowColor !== undefined) {
        customFlags.windowColor = true;
        state.windowColor = resolveColor(
          next.windowColor,
          PRESET_PALETTES[state.preset].windowColor,
        );
        customShader.setUniform('u_windowColor', state.windowColor);
      }
      if (next.baseElevation !== undefined) {
        if (!Number.isFinite(next.baseElevation)) {
          throw new RangeError('Expected baseElevation to be a finite number.');
        }
        state.baseElevation = next.baseElevation;
        customShader.setUniform('u_baseElevation', state.baseElevation);
      }
      if (next.maxHeight !== undefined) {
        validatePositiveFinite(next.maxHeight, 'maxHeight');
        state.maxHeight = next.maxHeight;
        customShader.setUniform('u_maxHeight', state.maxHeight);
      }
      if (next.scanSpeed !== undefined) {
        validateNonNegativeFinite(next.scanSpeed, 'scanSpeed');
        state.scanSpeed = next.scanSpeed;
        customShader.setUniform('u_scanSpeed', state.scanSpeed);
      }
      if (next.scanWidth !== undefined) {
        validatePositiveFinite(next.scanWidth, 'scanWidth');
        state.scanWidth = next.scanWidth;
        customShader.setUniform('u_scanWidth', state.scanWidth);
      }
      if (next.windowGlow !== undefined) {
        validateNonNegativeFinite(next.windowGlow, 'windowGlow');
        state.windowGlow = next.windowGlow;
        customShader.setUniform('u_windowGlow', state.windowGlow);
      }
      if (next.roofHighlight !== undefined) {
        validateNonNegativeFinite(next.roofHighlight, 'roofHighlight');
        state.roofHighlight = next.roofHighlight;
        customShader.setUniform('u_roofHighlight', state.roofHighlight);
      }
      if (next.opacity !== undefined) {
        validatePositiveFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        customShader.setUniform('u_opacity', state.opacity);
      }
    },
    setPaused(paused) {
      if (destroyed) return;
      clock.setPaused(paused);
    },
    isPaused() {
      return clock.isPaused();
    },
    restart() {
      if (destroyed) return;
      clock.restart();
      state.time = 0;
      customShader.setUniform('u_time', 0);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clock.destroy();
      if (!tileset.isDestroyed?.() && tileset.customShader === customShader) {
        tileset.customShader = previousShader;
      }
    },
    isDestroyed() {
      return destroyed;
    },
  };
}
