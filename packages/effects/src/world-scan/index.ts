import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  PostProcessStage,
  Transforms,
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

export type WorldScanMode = 'radial' | 'linear';

export interface WorldScanOptions extends EffectBaseOptions {
  /** Center geographic coordinate `[longitude, latitude]` in degrees. */
  center: LngLat;
  /** Center altitude in metres above the ellipsoid. Defaults to 0. */
  height?: number;
  /** Scan wave geometry: `'radial'` (expanding ring) or `'linear'` (advancing curtain). Defaults to `'radial'`. */
  mode?: WorldScanMode;
  /** Maximum scan reach in metres from `center`. Defaults to 8_000. */
  radius?: number;
  /** Luminous scan color (Cesium Color or CSS string). Defaults to '#00e5ff'. */
  color?: ColorInput;
  /** Width of the luminous trail behind the wavefront as a fraction of `radius` (0.04 to 0.6). Defaults to 0.22. */
  bandWidth?: number;
  /** Duration of one full scan sweep in seconds. Defaults to 4.5. */
  duration?: number;
  /** Animation speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall opacity / brightness multiplier (0 to 2). Defaults to 1. */
  intensity?: number;
  /** Sweep azimuth angle in degrees for `'linear'` mode (0 = North, 90 = East). Defaults to 45. */
  direction?: number;
  /** Reveal an anti-aliased holographic ground/facade grid inside the scan wake. Defaults to true. */
  gridEnabled?: boolean;
  /** Grid cell spacing in metres when `gridEnabled` is true. Defaults to 400. */
  gridSize?: number;
  /** Continuous looping scan (`true`) or one-shot `trigger()` mode (`false`). Defaults to true. */
  loop?: boolean;
}

export type WorldScanUpdateOptions = Partial<
  Pick<
    WorldScanOptions,
    | 'center'
    | 'height'
    | 'mode'
    | 'radius'
    | 'color'
    | 'bandWidth'
    | 'duration'
    | 'speed'
    | 'intensity'
    | 'direction'
    | 'gridEnabled'
    | 'gridSize'
    | 'loop'
  >
>;

export interface WorldScanHandle extends EffectHandle<WorldScanUpdateOptions> {
  /** Launches a scan wave immediately from the origin (essential when `loop: false`). */
  trigger(): void;
}

const DEFAULT_COLOR = Color.fromCssColorString('#00e5ff');

const WORLD_SCAN_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;

uniform vec3 u_centerEC;
uniform vec3 u_eastEC;
uniform vec3 u_northEC;
uniform vec3 u_upEC;
uniform vec2 u_dir2D;

uniform float u_mode;
uniform float u_radius;
uniform float u_bandWidth;
uniform float u_progress;
uniform float u_intensity;
uniform float u_gridEnabled;
uniform float u_gridSize;
uniform vec4 u_color;

in vec2 v_textureCoordinates;

void main(void) {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);

  if (u_progress < 0.0 || u_intensity <= 0.001) {
    out_FragColor = sceneColor;
    return;
  }

  float rawDepth = czm_readDepth(depthTexture, v_textureCoordinates);
  // Skip sky / far background pixels so the scan only illuminates terrain and 3D geometry.
  if (rawDepth >= 0.999995) {
    out_FragColor = sceneColor;
    return;
  }

  vec4 eyePos = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
  eyePos /= eyePos.w;

  // High-precision local ENU coordinates relative to scan origin (all computed in eye space).
  vec3 relEC = eyePos.xyz - u_centerEC;
  vec3 enu = vec3(
    dot(relEC, u_eastEC),
    dot(relEC, u_northEC),
    dot(relEC, u_upEC)
  );

  // Reconstruct local geometric normal from screen-space derivatives to highlight ridges & building facades.
  vec3 dpdx = dFdx(enu);
  vec3 dpdy = dFdy(enu);
  vec3 nCross = cross(dpdx, dpdy);
  float nLen = length(nCross);
  vec3 normalENU = nLen > 1e-5 ? (nCross / nLen) : vec3(0.0, 0.0, 1.0);
  float steepness = clamp(1.0 - abs(normalENU.z), 0.0, 1.0);

  float radius = max(1.0, u_radius);
  float band = clamp(u_bandWidth, 0.04, 0.6);

  float signedDist;
  float domainMask;
  if (u_mode < 0.5) {
    // Radial expanding spherical/cylindrical wavefront
    float dist = length(enu.xy);
    float front = u_progress * radius;
    signedDist = (front - dist) / radius;
    // Soft outer fade near max radius
    domainMask = 1.0 - smoothstep(0.92, 1.0, dist / radius);
  } else {
    // Linear advancing holographic scan curtain across [-radius, +radius]
    float along = dot(enu.xy, u_dir2D);
    float across = abs(dot(enu.xy, vec2(-u_dir2D.y, u_dir2D.x)));
    float front = mix(-radius, radius, u_progress);
    signedDist = (front - along) / (2.0 * radius);
    domainMask =
      (1.0 - smoothstep(0.88, 1.0, abs(along) / radius)) *
      (1.0 - smoothstep(0.85, 1.0, across / radius));
  }

  // Smooth fade-in at launch and fade-out at the end of the sweep.
  float lifeEnvelope = smoothstep(0.0, 0.06, u_progress) * (1.0 - smoothstep(0.86, 1.0, u_progress));

  // Crisp leading wavefront + exponential inward energy wake.
  float leadingLine = exp(-pow(signedDist / 0.011, 2.0));
  float inWake = step(0.0, signedDist) * (1.0 - smoothstep(0.0, band, signedDist));
  float wakeTail = inWake * pow(clamp(1.0 - signedDist / band, 0.0, 1.0), 1.85);

  // Subtle secondary echo ring trailing behind the main wavefront.
  float echoOffset = band * 0.42;
  float echoRing = exp(-pow((signedDist - echoOffset) / 0.016, 2.0)) * 0.35 * step(0.0, signedDist);

  // Anti-aliased 3D holographic grid (horizontal XY + vertical Z contours on cliffs/buildings).
  float gridSignal = 0.0;
  if (u_gridEnabled > 0.5 && wakeTail > 0.01) {
    float cell = max(10.0, u_gridSize);
    vec2 gCoord = enu.xy / cell;
    vec2 gDeriv = max(fwidth(gCoord), vec2(1e-4));
    vec2 gDist = abs(fract(gCoord - 0.5) - 0.5) / gDeriv;
    float xyLine = 1.0 - min(min(gDist.x, gDist.y), 1.0);

    // Subtle elevation contour lines on vertical building walls / steep mountain slopes.
    float zCoord = enu.z / max(8.0, cell * 0.25);
    float zDeriv = max(fwidth(zCoord), 1e-4);
    float zDist = abs(fract(zCoord - 0.5) - 0.5) / zDeriv;
    float zLine = (1.0 - min(zDist, 1.0)) * steepness * 0.75;

    gridSignal = max(xyLine, zLine) * wakeTail;
  }

  // Boost vertical facades & mountain ridges as the wavefront sweeps over them.
  float facadeBoost = 1.0 + steepness * 0.85;

  float energy =
    (leadingLine * 1.15 + wakeTail * 0.48 + echoRing + gridSignal * 0.65) *
    facadeBoost *
    domainMask *
    lifeEnvelope *
    clamp(u_intensity, 0.0, 2.0);

  // Hot white-tinted core right on the leading wavefront for crisp futuristic contrast.
  vec3 hotCore = mix(u_color.rgb, vec3(1.0), clamp(leadingLine * 0.65 + gridSignal * 0.2, 0.0, 0.78));
  vec3 finalRgb = sceneColor.rgb + hotCore * clamp(energy, 0.0, 1.35);

  out_FragColor = vec4(finalRgb, sceneColor.a);
}
`;

/**
 * Adds a pure-GPU `PostProcessStage` holographic scan wave that reconstructs 3D world
 * coordinates from Cesium's depth buffer, sweeping seamlessly across real terrain ridges
 * and 3D Tiles building facades with zero geometry overhead.
 */
export function createWorldScan(viewer: Viewer, options: WorldScanOptions): WorldScanHandle {
  validateLngLat(options.center, 'center');

  const state = {
    center: options.center,
    height: options.height ?? 0,
    mode: (options.mode ?? 'radial') as WorldScanMode,
    radius: options.radius ?? 8_000,
    color: resolveColor(options.color, DEFAULT_COLOR),
    bandWidth: options.bandWidth ?? 0.22,
    duration: options.duration ?? 4.5,
    speed: options.speed ?? 1,
    intensity: options.intensity ?? 1,
    direction: options.direction ?? 45,
    gridEnabled: options.gridEnabled ?? true,
    gridSize: options.gridSize ?? 400,
    loop: options.loop ?? true,
    time: 0,
    triggerStartTime: -1,
  };

  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }
  validatePositiveFinite(state.radius, 'radius');
  validatePositiveFinite(state.bandWidth, 'bandWidth');
  validatePositiveFinite(state.duration, 'duration');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.intensity, 'intensity');
  validatePositiveFinite(state.gridSize, 'gridSize');
  if (!Number.isFinite(state.direction)) {
    throw new RangeError('Expected direction to be a finite number.');
  }

  // Precomputed ECEF origin and ENU basis axes (rebuilt only when center/height changes).
  const centerECEF = new Cartesian3();
  const eastECEF = new Cartesian3();
  const northECEF = new Cartesian3();
  const upECEF = new Cartesian3();
  const enuMatrix = new Matrix4();
  const colScratch = new Cartesian4();

  // Reusable per-frame Eye Coordinate scratch vectors (zero per-frame allocations).
  const centerEC = new Cartesian3();
  const eastEC = new Cartesian3();
  const northEC = new Cartesian3();
  const upEC = new Cartesian3();
  const dir2D = { x: Math.SQRT1_2, y: Math.SQRT1_2 };

  const rebuildOriginFrame = () => {
    const ellipsoid = viewer.scene.globe?.ellipsoid;
    Cartesian3.fromDegrees(state.center[0], state.center[1], state.height, ellipsoid, centerECEF);
    Transforms.eastNorthUpToFixedFrame(centerECEF, ellipsoid, enuMatrix);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 0, colScratch), eastECEF);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 1, colScratch), northECEF);
    Cartesian3.fromCartesian4(Matrix4.getColumn(enuMatrix, 2, colScratch), upECEF);
    Cartesian3.normalize(eastECEF, eastECEF);
    Cartesian3.normalize(northECEF, northECEF);
    Cartesian3.normalize(upECEF, upECEF);
  };

  const syncDirection = () => {
    // 0 deg = North (+Y), 90 deg = East (+X)
    const rad = (state.direction * Math.PI) / 180;
    dir2D.x = Math.sin(rad);
    dir2D.y = Math.cos(rad);
  };

  rebuildOriginFrame();
  syncDirection();

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
  };

  const computeProgress = (): number => {
    const effectiveDuration = Math.max(0.1, state.duration);
    if (state.loop) {
      return ((state.time * state.speed) / effectiveDuration) % 1;
    }
    if (state.triggerStartTime < 0) {
      return -1;
    }
    const elapsed = (state.time - state.triggerStartTime) * state.speed;
    if (elapsed < 0 || elapsed > effectiveDuration) {
      return -1;
    }
    return elapsed / effectiveDuration;
  };

  const stage = new PostProcessStage({
    fragmentShader: WORLD_SCAN_FRAGMENT_SHADER,
    uniforms: {
      u_centerEC: () => {
        updateEyeBasis();
        return centerEC;
      },
      u_eastEC: () => eastEC,
      u_northEC: () => northEC,
      u_upEC: () => upEC,
      u_dir2D: () => dir2D,
      u_mode: () => (state.mode === 'linear' ? 1 : 0),
      u_radius: () => state.radius,
      u_bandWidth: () => state.bandWidth,
      u_progress: computeProgress,
      u_intensity: () => state.intensity,
      u_gridEnabled: () => (state.gridEnabled ? 1 : 0),
      u_gridSize: () => state.gridSize,
      u_color: () => state.color,
    },
  });

  let visible = options.show ?? true;
  let destroyed = false;
  stage.enabled = visible;

  viewer.scene.postProcessStages.add(stage);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    state.time = elapsedSeconds;
  });

  const setVisible = (nextVisible: boolean) => {
    if (destroyed) return;
    visible = nextVisible;
    stage.enabled = visible;
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
    trigger() {
      if (destroyed) return;
      if (state.loop) {
        clock.restart();
        state.time = 0;
      } else {
        state.triggerStartTime = state.time;
      }
    },
    update(next) {
      if (destroyed) return;
      let originDirty = false;
      if (next.center !== undefined) {
        validateLngLat(next.center, 'center');
        state.center = next.center;
        originDirty = true;
      }
      if (next.height !== undefined) {
        if (!Number.isFinite(next.height)) {
          throw new RangeError('Expected height to be a finite number.');
        }
        state.height = next.height;
        originDirty = true;
      }
      if (originDirty) {
        rebuildOriginFrame();
      }
      if (next.mode !== undefined) {
        state.mode = next.mode;
      }
      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        state.radius = next.radius;
      }
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
      }
      if (next.bandWidth !== undefined) {
        validatePositiveFinite(next.bandWidth, 'bandWidth');
        state.bandWidth = next.bandWidth;
      }
      if (next.duration !== undefined) {
        validatePositiveFinite(next.duration, 'duration');
        state.duration = next.duration;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
      }
      if (next.intensity !== undefined) {
        validateNonNegativeFinite(next.intensity, 'intensity');
        state.intensity = next.intensity;
      }
      if (next.direction !== undefined) {
        if (!Number.isFinite(next.direction)) {
          throw new RangeError('Expected direction to be a finite number.');
        }
        state.direction = next.direction;
        syncDirection();
      }
      if (next.gridEnabled !== undefined) {
        state.gridEnabled = next.gridEnabled;
      }
      if (next.gridSize !== undefined) {
        validatePositiveFinite(next.gridSize, 'gridSize');
        state.gridSize = next.gridSize;
      }
      if (next.loop !== undefined) {
        state.loop = next.loop;
        if (!state.loop) {
          state.triggerStartTime = state.time;
        }
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
      if (!state.loop) {
        state.triggerStartTime = 0;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clock.destroy();
      if (!viewer.isDestroyed()) {
        viewer.scene.postProcessStages.remove(stage);
      }
    },
    isDestroyed() {
      return destroyed;
    },
  };
}
