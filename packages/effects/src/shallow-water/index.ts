import {
  BlendingState,
  Cartographic,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  Material,
  Primitive,
  Rectangle,
  RectangleGeometry,
  type Viewer,
} from 'cesium';
import { createAnimationClock } from '../shared/clock.ts';
import {
  createPrimitiveEffectHandle,
  type EffectBaseOptions,
  type EffectHandle,
} from '../shared/effect.ts';
import {
  resolveColor,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';
import type { GeographicBounds } from '../fluid-simulation/index.ts';
import { generateProceduralTerrain, ShallowWaterSolver, type ShallowWaterMode } from './solver.ts';

export type { ShallowWaterMode } from './solver.ts';
export type ShallowWaterTerrainPreset = 'globe' | 'basin' | 'valley' | 'flat';

export interface ShallowWaterOptions extends EffectBaseOptions {
  /** Geographic rectangle [west, south, east, north] in degrees where the shallow-water PDE runs. */
  bounds: GeographicBounds;
  /** Altitude of the water plane above the ellipsoid in metres. Defaults to 1_750. */
  height?: number;
  /** Physics mode: `'ripples'` (wave reflection & diffraction) or `'flow'` (terrain gravity flow). Defaults to `'ripples'`. */
  mode?: ShallowWaterMode;
  /** Terrain heightfield source. `'globe'` samples Cesium terrain when loaded, falling back to procedural. Defaults to `'globe'`. */
  terrainPreset?: ShallowWaterTerrainPreset;
  /** Simulation grid resolution (width & height in texels). Defaults to 192. */
  resolution?: number;
  /** Wave speed / gravity multiplier (0.2 to 2.5). Defaults to 1.1. */
  waveSpeed?: number;
  /** Wave / flow damping factor (0.002 to 0.08). Defaults to 0.012. */
  damping?: number;
  /** Normalized water level [0.1 to 0.95] controlling shoreline obstacles in `'ripples'` mode. Defaults to 0.52. */
  waterLevel?: number;
  /** Shallow water tint (Cesium Color or CSS string). Defaults to '#22d3ee'. */
  shallowColor?: ColorInput;
  /** Deep water tint (Cesium Color or CSS string). Defaults to '#0b3a66'. */
  deepColor?: ColorInput;
  /** Sun specular & glint intensity (0 to 2). Defaults to 1.0. */
  specularIntensity?: number;
  /** Whitewater & shoreline foam intensity (0 to 2). Defaults to 0.85. */
  foamIntensity?: number;
  /** Simulation time speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall layer opacity multiplier. Defaults to 0.94. */
  opacity?: number;
  /** Automatically drive periodic ripples or mountain spring inflow so the water is alive on load. Defaults to true. */
  autoEmit?: boolean;
}

export type ShallowWaterUpdateOptions = Pick<
  ShallowWaterOptions,
  | 'mode'
  | 'terrainPreset'
  | 'waveSpeed'
  | 'damping'
  | 'waterLevel'
  | 'shallowColor'
  | 'deepColor'
  | 'specularIntensity'
  | 'foamIntensity'
  | 'speed'
  | 'opacity'
  | 'autoEmit'
>;

export interface ShallowWaterHandle extends EffectHandle<ShallowWaterUpdateOptions> {
  /** Injects a circular ripple impulse (ripples mode) or water volume (flow mode) at a geographic [lng, lat]. */
  drop(position: LngLat, strength?: number, radius?: number): void;
  /** Samples Cesium globe terrain heights inside `bounds` and uploads them to the GPU solver. */
  syncTerrain(): boolean;
  /** Clears all water height, wave, and flux buffers immediately. */
  clear(): void;
}

const DEFAULT_SHALLOW = Color.fromCssColorString('#22d3ee');
const DEFAULT_DEEP = Color.fromCssColorString('#0b3a66');

const SHALLOW_WATER_SURFACE_SHADER = /* glsl */ `
uniform sampler2D u_water;
uniform float u_opacity;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 sampleTex = texture(u_water, materialInput.st);
  material.diffuse = vec3(0.0);
  material.emission = sampleTex.rgb;
  material.alpha = clamp(sampleTex.a * u_opacity, 0.0, 0.96);
  return material;
}
`;

function validateBounds(bounds: GeographicBounds): void {
  const [west, south, east, north] = bounds;
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new RangeError('Expected bounds [west, south, east, north] to be finite degrees.');
  }
  if (west < -180 || east > 180 || west >= east) {
    throw new RangeError('Expected bounds longitude west < east within [-180, 180].');
  }
  if (south < -90 || north > 90 || south >= north) {
    throw new RangeError('Expected bounds latitude south < north within [-90, 90].');
  }
}

function createPresentCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

function colorToRgb(color: Color): readonly [number, number, number] {
  return [color.red, color.green, color.blue];
}

function sampleGlobeTerrainGrid(
  viewer: Viewer,
  bounds: GeographicBounds,
  gridSize: number,
  referenceHeight: number,
  mode: ShallowWaterMode,
): Float32Array | null {
  const globe = viewer.scene?.globe;
  if (!globe || typeof globe.getHeight !== 'function') return null;

  const [west, south, east, north] = bounds;
  const raw = new Float32Array(gridSize * gridSize);
  let validCount = 0;
  let minH = Infinity;
  let maxH = -Infinity;
  const carto = new Cartographic();

  for (let j = 0; j < gridSize; j += 1) {
    const v = j / (gridSize - 1);
    const lat = south + v * (north - south);
    for (let i = 0; i < gridSize; i += 1) {
      const u = i / (gridSize - 1);
      const lng = west + u * (east - west);
      carto.longitude = (lng * Math.PI) / 180;
      carto.latitude = (lat * Math.PI) / 180;
      const h = globe.getHeight(carto);
      if (typeof h === 'number' && Number.isFinite(h)) {
        raw[j * gridSize + i] = h;
        validCount += 1;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      } else {
        raw[j * gridSize + i] = Number.NaN;
      }
    }
  }

  // Require meaningful terrain variation (> 8 m relief) and > 70% coverage;
  // flat ellipsoid (0 m everywhere) shouldn't overwrite the sculpted procedural heightfield.
  if (validCount < gridSize * gridSize * 0.7 || maxH - minH < 8) {
    return null;
  }

  const normalized = new Float32Array(gridSize * gridSize);
  const span = Math.max(maxH - minH, 1);

  if (mode === 'ripples') {
    // Map terrain relative to referenceHeight so mountains above `height` act as dry reflective walls
    const low = Math.min(minH, referenceHeight - span * 0.45);
    const high = Math.max(maxH, referenceHeight + span * 0.45);
    const range = Math.max(high - low, 1);
    for (let k = 0; k < raw.length; k += 1) {
      const val = Number.isFinite(raw[k]) ? raw[k]! : minH;
      normalized[k] = Math.max(0, Math.min(1, (val - low) / range));
    }
  } else {
    for (let k = 0; k < raw.length; k += 1) {
      const val = Number.isFinite(raw[k]) ? raw[k]! : minH;
      normalized[k] = Math.max(0, Math.min(1, (val - minH) / span));
    }
  }

  return normalized;
}

/**
 * Adds a real-time GPU 2D Shallow Water Equations (SWE) simulation over a geographic
 * rectangle on the Cesium globe. Supports both depth-dependent ripple reflection/diffraction
 * around terrain obstacles (`mode: 'ripples'`) and gravity-driven virtual-pipe downhill
 * water flow (`mode: 'flow'`), with interactive `drop()` and automatic Cesium terrain sampling.
 */
export function createShallowWater(
  viewer: Viewer,
  options: ShallowWaterOptions,
): ShallowWaterHandle {
  validateBounds(options.bounds);
  const [west, south, east, north] = options.bounds;

  const height = options.height ?? 1_750;
  if (!Number.isFinite(height)) {
    throw new RangeError('Expected height to be a finite number.');
  }

  let mode: ShallowWaterMode = options.mode ?? 'ripples';
  let terrainPreset: ShallowWaterTerrainPreset = options.terrainPreset ?? 'globe';
  const resolution = options.resolution ?? 192;
  validatePositiveFinite(resolution, 'resolution');

  let waveSpeed = options.waveSpeed ?? 1.1;
  validatePositiveFinite(waveSpeed, 'waveSpeed');

  let damping = options.damping ?? 0.012;
  validateNonNegativeFinite(damping, 'damping');

  let waterLevel = options.waterLevel ?? 0.52;
  validatePositiveFinite(waterLevel, 'waterLevel');

  let shallowColor = resolveColor(options.shallowColor, DEFAULT_SHALLOW);
  let deepColor = resolveColor(options.deepColor, DEFAULT_DEEP);

  let specularIntensity = options.specularIntensity ?? 1.0;
  validateNonNegativeFinite(specularIntensity, 'specularIntensity');

  let foamIntensity = options.foamIntensity ?? 0.85;
  validateNonNegativeFinite(foamIntensity, 'foamIntensity');

  let speed = options.speed ?? 1;
  validateNonNegativeFinite(speed, 'speed');

  let opacity = options.opacity ?? 0.94;
  validateNonNegativeFinite(opacity, 'opacity');

  let autoEmit = options.autoEmit ?? true;

  const solver = ShallowWaterSolver.create({
    resolution,
    mode,
    waveSpeed,
    damping,
    shallowColor: colorToRgb(shallowColor),
    deepColor: colorToRgb(deepColor),
    specularIntensity,
    foamIntensity,
    waterLevel,
  });

  const canvasW = solver?.width ?? 16;
  const canvasH = solver?.height ?? 16;
  const presentA = createPresentCanvas(canvasW, canvasH);
  const presentB = createPresentCanvas(canvasW, canvasH);
  const presentPair = presentA && presentB ? ([presentA, presentB] as const) : null;
  let presentIndex = 0;

  // Always pass a cloneable string (Material.DefaultImageId) into fabric.uniforms so Cesium's
  // Material cache never retains an HTMLCanvasElement across mount/unmount cycles.
  const material = new Material({
    fabric: {
      type: 'CesiumlabShallowWater',
      uniforms: {
        u_water: Material.DefaultImageId,
        u_opacity: opacity,
      },
      source: SHALLOW_WATER_SURFACE_SHADER,
    },
    translucent: true,
  });

  if (presentPair?.[0]?.canvas) {
    material.uniforms.u_water = presentPair[0].canvas;
  }

  const rectangle = Rectangle.fromDegrees(west, south, east, north);
  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: new RectangleGeometry({
        rectangle,
        height,
        vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance: new EllipsoidSurfaceAppearance({
      material,
      flat: true,
      translucent: true,
      aboveGround: true,
      renderState: {
        blending: BlendingState.ALPHA_BLEND,
        depthMask: false,
      },
    }),
    asynchronous: false,
    show: options.show ?? true,
  });

  viewer.scene.primitives.add(primitive);

  const applyProceduralTerrain = (): void => {
    if (!solver) return;
    const preset: 'basin' | 'valley' | 'flat' =
      terrainPreset === 'globe' ? (mode === 'flow' ? 'valley' : 'basin') : terrainPreset;
    const grid = generateProceduralTerrain(solver.width, preset);
    solver.uploadTerrain(grid, solver.width, solver.height);
  };

  let globeSynced = false;
  const syncTerrain = (): boolean => {
    if (!solver) return false;
    if (terrainPreset !== 'globe') {
      applyProceduralTerrain();
      globeSynced = false;
      return true;
    }
    const sampled = sampleGlobeTerrainGrid(viewer, options.bounds, 64, height, mode);
    if (sampled) {
      solver.uploadTerrain(sampled, 64, 64);
      globeSynced = true;
      return true;
    }
    return false;
  };

  const presentFrame = (): void => {
    if (!solver || !presentPair) return;
    presentIndex = 1 - presentIndex;
    const slot = presentPair[presentIndex];
    if (slot.ctx) {
      slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
      slot.ctx.drawImage(solver.canvas, 0, 0);
      material.uniforms.u_water = slot.canvas;
    }
  };

  const seedInitialState = (): void => {
    if (!solver) return;
    applyProceduralTerrain();
    if (mode === 'ripples') {
      // Seed two crisp concentric ripples immediately so frame 1 is visually engaging
      solver.drop(0.48, 0.52, 0.85, 0.045);
      solver.drop(0.58, 0.44, 0.65, 0.038);
      for (let i = 0; i < 6; i += 1) {
        solver.step(1 / 60);
      }
    } else {
      // Pre-warm the mountain spring in flow mode so water is already streaming down the gorge
      for (let i = 0; i < 24; i += 1) {
        solver.drop(0.5, 0.88, 1.15, 0.065);
        solver.drop(0.42, 0.82, 0.75, 0.05);
        solver.step(1 / 60);
      }
    }
    presentFrame();
  };

  seedInitialState();

  let lastElapsed = 0;
  let dropTimer = 0;
  let terrainPollTimer = 0;
  let autoSeedIndex = 0;

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsed) => {
    if (primitive.isDestroyed() || !primitive.show) return;

    const rawDt = Math.max(0, elapsed - lastElapsed);
    lastElapsed = elapsed;

    if (!solver || rawDt <= 0) return;

    const dt = Math.min(rawDt * speed, 0.033);

    // Opportunistically sample real Cesium globe terrain once tiles finish streaming in
    if (terrainPreset === 'globe' && !globeSynced) {
      terrainPollTimer += rawDt;
      if (terrainPollTimer >= 1.5) {
        terrainPollTimer = 0;
        syncTerrain();
      }
    }

    if (autoEmit) {
      if (mode === 'ripples') {
        dropTimer += dt;
        if (dropTimer >= 1.05) {
          dropTimer = 0;
          autoSeedIndex += 1;
          // Deterministic golden-angle spread across the wet basin interior
          const angle = autoSeedIndex * 2.3999632;
          const radius = 0.08 + ((autoSeedIndex * 0.37) % 0.2);
          const u = 0.5 + Math.cos(angle) * radius;
          const v = 0.5 + Math.sin(angle) * radius;
          solver.drop(u, v, 0.75, 0.038);
        }
      } else {
        // Continuous alpine spring feeding the upper valley
        const sway = Math.sin(elapsed * 0.65) * 0.06;
        solver.drop(0.5 + sway, 0.88, 0.72, 0.055);
      }
    }

    solver.step(dt);
    presentFrame();
  });

  const baseHandle = createPrimitiveEffectHandle<ShallowWaterUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onRestart: () => {
      lastElapsed = 0;
      dropTimer = 0;
      autoSeedIndex = 0;
      solver?.clear();
      seedInitialState();
    },
    onUpdate: (next) => {
      let needsTerrainRefresh = false;
      let needsReseed = false;

      if (next.mode !== undefined && next.mode !== mode) {
        mode = next.mode;
        globeSynced = false;
        needsTerrainRefresh = true;
        needsReseed = true;
      }
      if (next.terrainPreset !== undefined && next.terrainPreset !== terrainPreset) {
        terrainPreset = next.terrainPreset;
        globeSynced = false;
        needsTerrainRefresh = true;
      }
      if (next.waveSpeed !== undefined) {
        validatePositiveFinite(next.waveSpeed, 'waveSpeed');
        waveSpeed = next.waveSpeed;
      }
      if (next.damping !== undefined) {
        validateNonNegativeFinite(next.damping, 'damping');
        damping = next.damping;
      }
      if (next.waterLevel !== undefined) {
        validatePositiveFinite(next.waterLevel, 'waterLevel');
        waterLevel = next.waterLevel;
      }
      if (next.shallowColor !== undefined) {
        shallowColor = resolveColor(next.shallowColor, shallowColor);
      }
      if (next.deepColor !== undefined) {
        deepColor = resolveColor(next.deepColor, deepColor);
      }
      if (next.specularIntensity !== undefined) {
        validateNonNegativeFinite(next.specularIntensity, 'specularIntensity');
        specularIntensity = next.specularIntensity;
      }
      if (next.foamIntensity !== undefined) {
        validateNonNegativeFinite(next.foamIntensity, 'foamIntensity');
        foamIntensity = next.foamIntensity;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        speed = next.speed;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        opacity = next.opacity;
        material.uniforms.u_opacity = opacity;
      }
      if (next.autoEmit !== undefined) {
        autoEmit = next.autoEmit;
      }

      solver?.updateConfig({
        mode,
        waveSpeed,
        damping,
        waterLevel,
        shallowColor: colorToRgb(shallowColor),
        deepColor: colorToRgb(deepColor),
        specularIntensity,
        foamIntensity,
      });

      if (needsTerrainRefresh) {
        if (!syncTerrain()) {
          applyProceduralTerrain();
        }
      }
      if (needsReseed) {
        seedInitialState();
      }
    },
    onDestroy: () => {
      solver?.destroy();
    },
  });

  return {
    ...baseHandle,
    drop(position: LngLat, strength = 0.85, radius = 0.042): void {
      if (baseHandle.isDestroyed() || !solver) return;
      const [lng, lat] = position;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const u = (lng - west) / (east - west);
      const v = (lat - south) / (north - south);
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      solver.drop(u, v, strength, radius);
    },
    syncTerrain,
    clear(): void {
      if (baseHandle.isDestroyed()) return;
      solver?.clear();
      presentFrame();
    },
  };
}
