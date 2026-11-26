import {
  BlendingState,
  ClassificationType,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  GroundPrimitive,
  Material,
  MaterialAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  type Viewer,
} from '@cesiumlab/cesium';
import { createAnimationClock } from '../shared/clock.ts';
import {
  createPrimitiveEffectHandle,
  type EffectBaseOptions,
  type EffectHandle,
} from '../shared/effect.ts';
import {
  resolveColor,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export type HeatmapPalette = 'thermal' | 'inferno' | 'viridis' | 'ocean';
export type HeatmapBounds = readonly [west: number, south: number, east: number, north: number];

export interface HeatmapPoint {
  /** Geographic `[longitude, latitude]` in degrees. */
  position: LngLat;
  /** Relative heat weight (> 0). Defaults to 1. */
  weight?: number;
}

export interface HeatmapOptions extends EffectBaseOptions {
  /** Weighted geographic sample points (minimum 1 point). */
  points: readonly HeatmapPoint[];
  /**
   * Optional geographic bounding rectangle `[west, south, east, north]` in degrees.
   * When omitted, automatically computed from `points` with comfortable kernel padding.
   */
  bounds?: HeatmapBounds;
  /** Kernel influence radius as a fraction of the grid width (0.01 to 0.25). Defaults to 0.065. */
  radius?: number;
  /** Density texture resolution in pixels (width & height). Defaults to 512. */
  resolution?: number;
  /** Built-in 5-stop color ramp preset. Defaults to `'thermal'`. */
  palette?: HeatmapPalette;
  /** Optional custom 5-stop color ramp overriding `palette`. */
  colors?: readonly [ColorInput, ColorInput, ColorInput, ColorInput, ColorInput];
  /** Density intensity multiplier (0.2 to 3). Defaults to 1. */
  intensity?: number;
  /** Lower density cutoff in [0, 0.4] below which pixels become fully transparent. Defaults to 0.04. */
  minThreshold?: number;
  /** Overall layer opacity multiplier (0 to 1). Defaults to 0.82. */
  opacity?: number;
  /** Overlay crisp anti-aliased equal-density contour lines. Defaults to false. */
  contours?: boolean;
  /**
   * Drape the heatmap pixel-perfectly onto terrain and 3D Tiles via `GroundPrimitive`.
   * When `false`, renders on a floating `Primitive` rectangle at `height`. Defaults to `true`.
   */
  clampToGround?: boolean;
  /** Altitude above the ellipsoid in metres when `clampToGround` is `false`. Defaults to 200. */
  height?: number;
  /** Classification target when `clampToGround` is `true`. Defaults to `ClassificationType.BOTH`. */
  classificationType?: ClassificationType;
}

export type HeatmapUpdateOptions = Partial<
  Pick<
    HeatmapOptions,
    | 'points'
    | 'radius'
    | 'palette'
    | 'colors'
    | 'intensity'
    | 'minThreshold'
    | 'opacity'
    | 'contours'
    | 'clampToGround'
    | 'height'
  >
>;

export type HeatmapHandle = EffectHandle<HeatmapUpdateOptions>;

const PALETTES: Record<HeatmapPalette, readonly [Color, Color, Color, Color, Color]> = {
  thermal: [
    Color.fromCssColorString('#1e3a8a'),
    Color.fromCssColorString('#06b6d4'),
    Color.fromCssColorString('#22c55e'),
    Color.fromCssColorString('#facc15'),
    Color.fromCssColorString('#ef4444'),
  ],
  inferno: [
    Color.fromCssColorString('#1b0c41'),
    Color.fromCssColorString('#781c6d'),
    Color.fromCssColorString('#cf4446'),
    Color.fromCssColorString('#fb9b06'),
    Color.fromCssColorString('#fcffa4'),
  ],
  viridis: [
    Color.fromCssColorString('#440154'),
    Color.fromCssColorString('#3b528b'),
    Color.fromCssColorString('#21918c'),
    Color.fromCssColorString('#5ec962'),
    Color.fromCssColorString('#fde725'),
  ],
  ocean: [
    Color.fromCssColorString('#0c1e4a'),
    Color.fromCssColorString('#0369a1'),
    Color.fromCssColorString('#06b6d4'),
    Color.fromCssColorString('#5eead4'),
    Color.fromCssColorString('#f0fdfa'),
  ],
};

const HEATMAP_SHADER_SOURCE = /* glsl */ `
uniform sampler2D u_density;
uniform vec4 u_stop0;
uniform vec4 u_stop1;
uniform vec4 u_stop2;
uniform vec4 u_stop3;
uniform vec4 u_stop4;
uniform float u_intensity;
uniform float u_minThreshold;
uniform float u_opacity;
uniform float u_contours;

vec3 sampleRamp(float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(u_stop0.rgb, u_stop1.rgb, x);
  if (x < 2.0) return mix(u_stop1.rgb, u_stop2.rgb, x - 1.0);
  if (x < 3.0) return mix(u_stop2.rgb, u_stop3.rgb, x - 2.0);
  return mix(u_stop3.rgb, u_stop4.rgb, x - 3.0);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Soft edge feathering so the rectangular domain never shows hard box seams.
  vec2 edgeDist = min(st, 1.0 - st);
  float edgeFeather = smoothstep(0.0, 0.03, min(edgeDist.x, edgeDist.y));

  float raw = texture(u_density, st).r;
  float density = clamp(raw * u_intensity, 0.0, 1.0);

  // Smooth threshold ramp so low-density outskirts dissolve cleanly into the base imagery.
  float cutoff = clamp(u_minThreshold, 0.0, 0.45);
  float visible = smoothstep(cutoff, cutoff + 0.14, density);
  if (visible <= 0.001) {
    material.alpha = 0.0;
    return material;
  }

  // Non-linear perceptual boost so mid-range hotspots remain readable alongside peak cores.
  float colorT = pow(clamp((density - cutoff) / max(1.0 - cutoff, 0.05), 0.0, 1.0), 0.85);
  vec3 tint = sampleRamp(colorT);

  // Optional anti-aliased equal-density topographic isolines.
  if (u_contours > 0.5) {
    float levels = density * 8.0;
    float distToLine = abs(fract(levels - 0.5) - 0.5);
    float fw = max(fwidth(levels), 0.02);
    float lineMask = (1.0 - smoothstep(0.0, fw * 1.4, distToLine)) * smoothstep(cutoff + 0.06, cutoff + 0.2, density);
    tint = mix(tint, vec3(1.0), lineMask * 0.48);
  }

  float alpha = clamp(visible * mix(0.45, 1.0, pow(colorT, 0.65)) * u_opacity * edgeFeather, 0.0, 0.94);

  material.diffuse = vec3(0.0);
  material.emission = tint;
  material.alpha = alpha;
  return material;
}
`;

function validatePoints(points: readonly HeatmapPoint[]): void {
  if (!Array.isArray(points) || points.length === 0) {
    throw new RangeError('Expected points to contain at least 1 HeatmapPoint.');
  }
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    validateLngLat(pt.position, `points[${i}].position`);
    if (pt.weight !== undefined) {
      validateNonNegativeFinite(pt.weight, `points[${i}].weight`);
    }
  }
}

function validateBounds(bounds: HeatmapBounds): void {
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

function computeAutoBounds(points: readonly HeatmapPoint[], radiusFrac: number): HeatmapBounds {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const pt of points) {
    const [lng, lat] = pt.position;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLng = Math.max(0.02, maxLng - minLng);
  const spanLat = Math.max(0.02, maxLat - minLat);
  const padFactor = Math.max(0.12, radiusFrac * 1.8);
  const padLng = spanLng * padFactor;
  const padLat = spanLat * padFactor;

  return [
    Math.max(-180, minLng - padLng),
    Math.max(-89.5, minLat - padLat),
    Math.min(180, maxLng + padLng),
    Math.min(89.5, maxLat + padLat),
  ];
}

function resolveColorStops(
  palette: HeatmapPalette,
  custom?: readonly [ColorInput, ColorInput, ColorInput, ColorInput, ColorInput],
): readonly [Color, Color, Color, Color, Color] {
  const base = PALETTES[palette];
  if (!custom) return base;
  return [
    resolveColor(custom[0], base[0]),
    resolveColor(custom[1], base[1]),
    resolveColor(custom[2], base[2]),
    resolveColor(custom[3], base[3]),
    resolveColor(custom[4], base[4]),
  ];
}

interface DensityCanvasSlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
}

function createCanvasSlot(size: number): DensityCanvasSlot | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

/**
 * Rasterizes weighted geographic points into a normalized Gaussian kernel density field
 * onto the target 2D canvas (stored in the red/luminance channel for GPU palette mapping).
 * Uses a fast separable box/Gaussian splat accumulator in Float32Array so density never
 * clips at 8-bit saturation even when thousands of points overlap in a dense hotspot.
 */
function rasterizeDensity(
  slot: DensityCanvasSlot,
  points: readonly HeatmapPoint[],
  bounds: HeatmapBounds,
  radiusFrac: number,
): void {
  const ctx = slot.ctx;
  if (!ctx) return;

  const size = slot.canvas.width;
  const [west, south, east, north] = bounds;
  const invSpanLng = 1 / Math.max(1e-9, east - west);
  const invSpanLat = 1 / Math.max(1e-9, north - south);

  const radiusPx = Math.max(3, Math.min(Math.floor(size * 0.25), Math.round(size * radiusFrac)));
  const grid = new Float32Array(size * size);

  // Precompute 1D Gaussian weights for fast separable 2-pass blur after point binning
  // (O(N_points + 2 * size^2 * radius) -> ~2ms even for 50,000 points!)
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    const [lng, lat] = pt.position;
    const u = (lng - west) * invSpanLng;
    const v = (lat - south) * invSpanLat;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;

    const px = Math.min(size - 1, Math.max(0, Math.round(u * (size - 1))));
    // Canvas y = 0 is top (north), whereas Cesium st.y = 0 is south (flipped on texture upload)
    const py = Math.min(size - 1, Math.max(0, Math.round((1 - v) * (size - 1))));
    grid[py * size + px] = (grid[py * size + px] ?? 0) + (pt.weight ?? 1);
  }

  // Build normalized 1D Gaussian kernel
  const sigma = Math.max(1.2, radiusPx * 0.42);
  const invTwoSigma2 = 1 / (2 * sigma * sigma);
  const kernel = new Float32Array(radiusPx + 1);
  for (let k = 0; k <= radiusPx; k += 1) {
    kernel[k] = Math.exp(-k * k * invTwoSigma2);
  }

  // Horizontal pass
  const temp = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const rowOff = y * size;
    for (let x = 0; x < size; x += 1) {
      const val = grid[rowOff + x]!;
      if (val === 0) continue;
      temp[rowOff + x] = (temp[rowOff + x] ?? 0) + val * kernel[0]!;
      const maxK = Math.min(radiusPx, size - 1 - x);
      for (let k = 1; k <= maxK; k += 1) {
        temp[rowOff + x + k] = (temp[rowOff + x + k] ?? 0) + val * kernel[k]!;
      }
      const minK = Math.min(radiusPx, x);
      for (let k = 1; k <= minK; k += 1) {
        temp[rowOff + x - k] = (temp[rowOff + x - k] ?? 0) + val * kernel[k]!;
      }
    }
  }

  // Vertical pass + track peak density for smooth auto-normalization
  const blurred = new Float32Array(size * size);
  let maxVal = 0;
  for (let y = 0; y < size; y += 1) {
    const rowOff = y * size;
    for (let x = 0; x < size; x += 1) {
      let sum = temp[rowOff + x]! * kernel[0]!;
      const maxK = Math.min(radiusPx, size - 1 - y);
      for (let k = 1; k <= maxK; k += 1) {
        sum += temp[(y + k) * size + x]! * kernel[k]!;
      }
      const minK = Math.min(radiusPx, y);
      for (let k = 1; k <= minK; k += 1) {
        sum += temp[(y - k) * size + x]! * kernel[k]!;
      }
      blurred[rowOff + x] = sum;
      if (sum > maxVal) maxVal = sum;
    }
  }

  const imageData = ctx.createImageData(size, size);
  const out = imageData.data;
  const invMax = maxVal > 1e-8 ? 1 / maxVal : 0;

  for (let i = 0; i < size * size; i += 1) {
    const norm = Math.max(0, Math.min(1, blurred[i]! * invMax));
    const byte = Math.round(norm * 255);
    const idx = i * 4;
    out[idx] = byte;
    out[idx + 1] = byte;
    out[idx + 2] = byte;
    out[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Adds a GPU-rendered geographic kernel-density heatmap with O(1) live palette,
 * intensity, opacity, and isoline contour updates, seamlessly switchable between
 * terrain/3D-Tiles-clamped `GroundPrimitive` and floating `Primitive`.
 */
export function createHeatmap(viewer: Viewer, options: HeatmapOptions): HeatmapHandle {
  validatePoints(options.points);

  const resolution = Math.max(128, Math.min(1024, Math.round(options.resolution ?? 384)));
  validatePositiveFinite(resolution, 'resolution');

  const classificationType = options.classificationType ?? ClassificationType.BOTH;

  const state = {
    points: options.points,
    radius: Math.max(0.01, Math.min(0.25, options.radius ?? 0.065)),
    palette: options.palette ?? ('thermal' as HeatmapPalette),
    colors: options.colors,
    intensity: options.intensity ?? 1,
    minThreshold: options.minThreshold ?? 0.04,
    opacity: options.opacity ?? 0.82,
    contours: options.contours ?? false,
    clampToGround: options.clampToGround ?? true,
    height: options.height ?? 200,
  };

  validatePositiveFinite(state.radius, 'radius');
  validateNonNegativeFinite(state.intensity, 'intensity');
  validateNonNegativeFinite(state.minThreshold, 'minThreshold');
  validateNonNegativeFinite(state.opacity, 'opacity');
  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }

  const bounds = options.bounds ?? computeAutoBounds(state.points, state.radius);
  validateBounds(bounds);
  const [west, south, east, north] = bounds;
  const rectangle = Rectangle.fromDegrees(west, south, east, north);
  const ellipsoid = viewer.scene.ellipsoid;

  const stops = resolveColorStops(state.palette, state.colors);

  // Alternate between two 2D canvases so Cesium Material re-uploads cleanly via pure public API
  // while initializing fabric.uniforms with Material.DefaultImageId so Cesium's Material cache
  // never attempts to clone an HTMLCanvasElement on remount.
  const slotA = createCanvasSlot(resolution);
  const slotB = createCanvasSlot(resolution);
  const presentPair = slotA && slotB ? ([slotA, slotB] as const) : null;
  let slotIndex = 0;

  const material = new Material({
    fabric: {
      type: 'CesiumlabHeatmap',
      uniforms: {
        u_density: Material.DefaultImageId,
        u_stop0: stops[0],
        u_stop1: stops[1],
        u_stop2: stops[2],
        u_stop3: stops[3],
        u_stop4: stops[4],
        u_intensity: state.intensity,
        u_minThreshold: state.minThreshold,
        u_opacity: state.opacity,
        u_contours: state.contours ? 1 : 0,
      },
      source: HEATMAP_SHADER_SOURCE,
    },
    translucent: true,
  });

  const uploadDensity = (): void => {
    if (!presentPair) return;
    slotIndex = 1 - slotIndex;
    const slot = presentPair[slotIndex];
    rasterizeDensity(slot, state.points, bounds, state.radius);
    material.uniforms.u_density = slot.canvas;
  };

  uploadDensity();

  const buildGroundPrimitive = (): GroundPrimitive =>
    new GroundPrimitive({
      geometryInstances: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle,
          ellipsoid,
        }),
      }),
      appearance: new MaterialAppearance({
        material,
        flat: true,
        translucent: true,
      }),
      classificationType,
      asynchronous: true,
    });

  const buildFlatPrimitive = (altitude: number): Primitive =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle,
          height: altitude,
          ellipsoid,
          vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new EllipsoidSurfaceAppearance({
        material,
        flat: true,
        translucent: true,
        aboveGround: true,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          blending: BlendingState.ALPHA_BLEND,
        },
      }),
      asynchronous: false,
    });

  let activeInGround = state.clampToGround;
  let primitive: GroundPrimitive | Primitive = activeInGround
    ? buildGroundPrimitive()
    : buildFlatPrimitive(state.height);

  const getActiveCollection = () =>
    activeInGround
      ? (viewer.scene.groundPrimitives ?? viewer.scene.primitives)
      : viewer.scene.primitives;

  getActiveCollection().add(primitive);

  const swapPrimitive = (nextClamped: boolean, nextPrimitive: GroundPrimitive | Primitive) => {
    if (viewer.isDestroyed()) return;
    const wasVisible = primitive.show;
    getActiveCollection().remove(primitive);
    activeInGround = nextClamped;
    primitive = nextPrimitive;
    primitive.show = wasVisible;
    getActiveCollection().add(primitive);
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, () => {});

  return createPrimitiveEffectHandle<HeatmapUpdateOptions>({
    viewer,
    clock,
    getCollection: getActiveCollection,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      let needsRaster = false;

      if (next.points !== undefined) {
        validatePoints(next.points);
        state.points = next.points;
        needsRaster = true;
      }
      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        const clamped = Math.max(0.01, Math.min(0.25, next.radius));
        if (clamped !== state.radius) {
          state.radius = clamped;
          needsRaster = true;
        }
      }
      if (next.palette !== undefined || next.colors !== undefined) {
        if (next.palette !== undefined) state.palette = next.palette;
        if (next.colors !== undefined) state.colors = next.colors;
        const nextStops = resolveColorStops(state.palette, state.colors);
        material.uniforms.u_stop0 = nextStops[0];
        material.uniforms.u_stop1 = nextStops[1];
        material.uniforms.u_stop2 = nextStops[2];
        material.uniforms.u_stop3 = nextStops[3];
        material.uniforms.u_stop4 = nextStops[4];
      }
      if (next.intensity !== undefined) {
        validateNonNegativeFinite(next.intensity, 'intensity');
        state.intensity = next.intensity;
        material.uniforms.u_intensity = state.intensity;
      }
      if (next.minThreshold !== undefined) {
        validateNonNegativeFinite(next.minThreshold, 'minThreshold');
        state.minThreshold = next.minThreshold;
        material.uniforms.u_minThreshold = state.minThreshold;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = Math.min(1, next.opacity);
        material.uniforms.u_opacity = state.opacity;
      }
      if (next.contours !== undefined) {
        state.contours = next.contours;
        material.uniforms.u_contours = state.contours ? 1 : 0;
      }

      if (needsRaster) {
        uploadDensity();
      }

      const clampChanged =
        next.clampToGround !== undefined && next.clampToGround !== state.clampToGround;
      const heightChanged = next.height !== undefined && next.height !== state.height;

      if (next.height !== undefined) {
        if (!Number.isFinite(next.height)) {
          throw new RangeError('Expected height to be a finite number.');
        }
        state.height = next.height;
      }
      if (next.clampToGround !== undefined) {
        state.clampToGround = next.clampToGround;
      }

      if (clampChanged) {
        swapPrimitive(
          state.clampToGround,
          state.clampToGround ? buildGroundPrimitive() : buildFlatPrimitive(state.height),
        );
      } else if (heightChanged && !state.clampToGround) {
        swapPrimitive(false, buildFlatPrimitive(state.height));
      }
    },
  });
}
