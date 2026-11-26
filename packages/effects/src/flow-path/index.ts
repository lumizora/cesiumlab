import {
  ArcType,
  BlendingState,
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  Material,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
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

export interface FlowPathItem {
  /** Optional identifier used for O(1) runtime style updates via `setPathStyle(id, ...)`. */
  id?: string;
  /** Ordered path vertices as `[longitude, latitude]` degrees (minimum 2 points). */
  positions: readonly LngLat[];
  /** Per-path static base track color. Falls back to `options.color`. */
  color?: ColorInput;
  /** Per-path leading pulse front color. Falls back to `options.headColor`. */
  headColor?: ColorInput;
  /** Per-path trailing pulse tail color. Falls back to per-path `color` or `options.trailColor`. */
  trailColor?: ColorInput;
  /** Per-path initial animation phase offset in `[0, 1)`. Falls back to `options.phase`. */
  phase?: number;
}

export type FlowPathPositions =
  | readonly LngLat[]
  | readonly (readonly LngLat[])[]
  | readonly FlowPathItem[];

export interface FlowPathOptions extends EffectBaseOptions {
  /**
   * Single path (`LngLat[]`) or multi-path road network (`LngLat[][]`) as `[longitude, latitude]`
   * degrees. Multi-path inputs are automatically batched into a single Primitive / Draw Call.
   */
  positions: FlowPathPositions;
  /** Static base track color (Cesium Color or CSS string). Also used as fallback for `trailColor`. Defaults to '#00e5a0'. */
  color?: ColorInput;
  /** Leading pulse front color (Cesium Color or CSS string). Defaults to '#ffffff'. */
  headColor?: ColorInput;
  /** Trailing pulse tail color (Cesium Color or CSS string). Defaults to `color` when omitted. */
  trailColor?: ColorInput;
  /** Screen-space ribbon width in pixels. Defaults to 10. */
  width?: number;
  /** Flow speed multiplier along the path. Defaults to 1. */
  speed?: number;
  /** Number of staggered luminous pulses along the path (1 to 8). Defaults to 3. */
  pulseCount?: number;
  /** Length of each tapered pulse trail as a fraction of one pulse slot (0.1 to 0.95). Defaults to 0.52. */
  trailLength?: number;
  /** Opacity of the continuous glowing base path (0 to 1). Defaults to 0.35. */
  baseOpacity?: number;
  /** Brightness multiplier for the flowing energy pulses. Defaults to 1. */
  brightness?: number;
  /** Reverse flow direction (from last point toward first). Defaults to false. */
  reverse?: boolean;
  /** Close each path from the last vertex back to the first. Defaults to false. */
  loop?: boolean;
  /** Initial normalized animation phase offset in [0, 1). Defaults to 0. */
  phase?: number;
  /**
   * Drape paths onto terrain and 3D Tiles via `GroundPolylinePrimitive`.
   * Set to `false` to render as a lightweight batched `Primitive` (`PolylineGeometry`) at `height`,
   * which is 3–5× faster for flat cities and massive road networks. Defaults to `true`.
   */
  clampToGround?: boolean;
  /** Altitude above the ellipsoid in metres when `clampToGround` is `false`. Defaults to 0. */
  height?: number;
  /** Classification target for clamping (terrain, 3D Tiles, or both). Defaults to ClassificationType.BOTH. */
  classificationType?: ClassificationType;
}

export type FlowPathUpdateOptions = Pick<
  FlowPathOptions,
  | 'color'
  | 'headColor'
  | 'trailColor'
  | 'speed'
  | 'pulseCount'
  | 'trailLength'
  | 'baseOpacity'
  | 'brightness'
  | 'reverse'
  | 'clampToGround'
  | 'height'
>;

export interface FlowPathStylePatch {
  color?: ColorInput;
  headColor?: ColorInput;
  trailColor?: ColorInput;
}

export interface FlowPathHandle extends EffectHandle<FlowPathUpdateOptions> {
  /**
   * Updates an individual path's colors in O(1) via Cesium BatchTable attributes
   * (zero geometry rebuild; works in both clamped and non-clamped modes when created with `FlowPathItem[]`).
   */
  setPathStyle(id: string, style: FlowPathStylePatch): void;
}

const DEFAULT_COLOR = Color.fromCssColorString('#00e5a0');
const DEFAULT_HEAD_COLOR = Color.WHITE;
const MAX_PULSES = 8;

const FLOW_PATH_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform vec4 u_headColor;
uniform vec4 u_trailColor;
uniform float u_time;
uniform float u_speed;
uniform float u_phase;
uniform float u_pulseCount;
uniform float u_trailLength;
uniform float u_baseOpacity;
uniform float u_brightness;
uniform float u_direction;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Normalized distance from ribbon centerline: 0 at center, 1 at edge.
  float d = abs(st.t - 0.5) * 2.0;

  // Crisp anti-aliased uniform-width vector stroke (Amap Loca PulseLineLayer style) + subtle edge bloom.
  float strokeMask = 1.0 - smoothstep(0.58, 0.96, d);
  float edgeGlow = exp(-d * d * 4.5) * 0.22;

  // Seamless periodic pulse streams along the path.
  float count = clamp(u_pulseCount, 1.0, 8.0);
  float coord = u_direction > 0.0 ? st.s : (1.0 - st.s);
  float slotPos = fract(coord * count - u_time * u_speed * 0.36 + u_phase);

  // Longitudinal distance behind the pulse front in [0, 1).
  float behind = fract(1.0 - slotPos);
  float trailSpan = clamp(u_trailLength, 0.1, 0.95);

  float pulseMask = 0.0;
  float colorFrac = 0.0;

  if (behind <= trailSpan) {
    float frac = behind / max(0.001, trailSpan);
    colorFrac = frac;
    // Crisp anti-aliased leading edge + full-bodied tail so both headColor and trailColor stay vivid.
    float frontEdge = smoothstep(0.0, 0.03, frac);
    float tailFade = pow(1.0 - frac, 0.65);
    pulseMask = frontEdge * tailFade;
  } else {
    float ahead = 1.0 - behind;
    pulseMask = smoothstep(0.022, 0.0, ahead);
    colorFrac = 0.0;
  }

  // Smooth full-segment gradient from headColor (front) -> trailColor (tail).
  vec3 pulseColor = mix(u_headColor.rgb, u_trailColor.rgb, smoothstep(0.04, 0.9, colorFrac));

  float baseAlpha = strokeMask * u_baseOpacity;
  float pulseAlpha = clamp(pulseMask * (strokeMask + edgeGlow) * u_brightness, 0.0, 1.0);
  float totalAlpha = clamp(max(baseAlpha, pulseAlpha), 0.0, 0.96);

  // Active pulse cleanly overrides the static base track color without washing out to white.
  float pulseWeight = clamp(pulseAlpha / max(totalAlpha, 0.001), 0.0, 1.0);
  vec3 finalRgb = mix(u_color.rgb, pulseColor, pulseWeight);

  material.diffuse = vec3(0.0);
  material.emission = finalRgb * (0.92 + 0.18 * pulseMask * clamp(u_brightness, 0.0, 1.5));
  material.alpha = totalAlpha;
  return material;
}
`;

const FLOW_PATH_BATCHED_SHADER_SOURCE = /* glsl */ `
uniform float u_time;
uniform float u_speed;
uniform float u_phase;
uniform float u_pulseCount;
uniform float u_trailLength;
uniform float u_baseOpacity;
uniform float u_brightness;
uniform float u_direction;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  vec4 pColor = czm_batchTable_pathColor(materialInput.batchId);
  vec4 hColor = czm_batchTable_headColor(materialInput.batchId);
  vec4 tColor = czm_batchTable_trailColor(materialInput.batchId);

  float d = abs(st.t - 0.5) * 2.0;
  float strokeMask = 1.0 - smoothstep(0.58, 0.96, d);
  float edgeGlow = exp(-d * d * 4.5) * 0.22;

  float count = clamp(u_pulseCount, 1.0, 8.0);
  float coord = u_direction > 0.0 ? st.s : (1.0 - st.s);
  float slotPos = fract(coord * count - u_time * u_speed * 0.36 + u_phase + pColor.a);

  float behind = fract(1.0 - slotPos);
  float trailSpan = clamp(u_trailLength, 0.1, 0.95);

  float pulseMask = 0.0;
  float colorFrac = 0.0;

  if (behind <= trailSpan) {
    float frac = behind / max(0.001, trailSpan);
    colorFrac = frac;
    float frontEdge = smoothstep(0.0, 0.03, frac);
    float tailFade = pow(1.0 - frac, 0.65);
    pulseMask = frontEdge * tailFade;
  } else {
    float ahead = 1.0 - behind;
    pulseMask = smoothstep(0.022, 0.0, ahead);
    colorFrac = 0.0;
  }

  vec3 pulseColor = mix(hColor.rgb, tColor.rgb, smoothstep(0.04, 0.9, colorFrac));

  float baseAlpha = strokeMask * u_baseOpacity;
  float pulseAlpha = clamp(pulseMask * (strokeMask + edgeGlow) * u_brightness, 0.0, 1.0);
  float totalAlpha = clamp(max(baseAlpha, pulseAlpha), 0.0, 0.96);

  float pulseWeight = clamp(pulseAlpha / max(totalAlpha, 0.001), 0.0, 1.0);
  vec3 finalRgb = mix(pColor.rgb, pulseColor, pulseWeight);

  material.diffuse = vec3(0.0);
  material.emission = finalRgb * (0.92 + 0.18 * pulseMask * clamp(u_brightness, 0.0, 1.5));
  material.alpha = totalAlpha;
  return material;
}
`;

interface NormalizedFlowPath {
  id: string;
  positions: readonly LngLat[];
  color?: ColorInput;
  headColor?: ColorInput;
  trailColor?: ColorInput;
  phase?: number;
}

function isFlowPathItem(entry: unknown): entry is FlowPathItem {
  return (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry) && 'positions' in entry
  );
}

function normalizePaths(input: FlowPathPositions): {
  items: readonly NormalizedFlowPath[];
  useBatchColors: boolean;
} {
  if (!Array.isArray(input) || input.length === 0) {
    throw new RangeError('Expected positions to contain at least 2 [longitude, latitude] points.');
  }

  const first = input[0];
  if (isFlowPathItem(first)) {
    const items: NormalizedFlowPath[] = [];
    for (let p = 0; p < input.length; p += 1) {
      const item = input[p] as FlowPathItem;
      if (!item || !Array.isArray(item.positions) || item.positions.length < 2) {
        throw new RangeError(
          `Expected positions[${p}].positions to contain at least 2 [longitude, latitude] points.`,
        );
      }
      for (let i = 0; i < item.positions.length; i += 1) {
        validateLngLat(item.positions[i]!, `positions[${p}].positions[${i}]`);
      }
      items.push({
        id: item.id ?? `flow-path-${p}`,
        positions: item.positions,
        color: item.color,
        headColor: item.headColor,
        trailColor: item.trailColor,
        phase: item.phase,
      });
    }
    return { items, useBatchColors: true };
  }

  const isMultiPath = Array.isArray(first) && Array.isArray(first[0]);
  const paths: readonly (readonly LngLat[])[] = isMultiPath
    ? (input as readonly (readonly LngLat[])[])
    : [input as readonly LngLat[]];

  const items: NormalizedFlowPath[] = [];
  for (let p = 0; p < paths.length; p += 1) {
    const path = paths[p];
    if (!Array.isArray(path) || path.length < 2) {
      throw new RangeError(
        `Expected positions${isMultiPath ? `[${p}]` : ''} to contain at least 2 [longitude, latitude] points.`,
      );
    }
    for (let i = 0; i < path.length; i += 1) {
      validateLngLat(path[i]!, isMultiPath ? `positions[${p}][${i}]` : `positions[${i}]`);
    }
    items.push({ id: `flow-path-${p}`, positions: path });
  }

  return { items, useBatchColors: false };
}

/**
 * Adds a GPU-driven luminous flowing path (or a batched multi-path road network) that
 * seamlessly switches between terrain/3D-Tiles-clamped `GroundPolylinePrimitive` and
 * high-performance non-clamped `Primitive` (`PolylineGeometry`).
 */
export function createFlowPath(viewer: Viewer, options: FlowPathOptions): FlowPathHandle {
  const { items: normalizedItems, useBatchColors } = normalizePaths(options.positions);
  const ellipsoid = viewer.scene.ellipsoid;

  const width = options.width ?? 10;
  const loop = options.loop ?? false;
  const phase = options.phase ?? 0;
  const classificationType = options.classificationType ?? ClassificationType.BOTH;

  validatePositiveFinite(width, 'width');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const initialColor = resolveColor(options.color, DEFAULT_COLOR);
  const state = {
    color: initialColor,
    headColor: resolveColor(options.headColor, DEFAULT_HEAD_COLOR),
    trailColor: resolveColor(options.trailColor, initialColor),
    hasCustomTrailColor: options.trailColor !== undefined,
    speed: options.speed ?? 1,
    pulseCount: Math.max(1, Math.min(MAX_PULSES, Math.round(options.pulseCount ?? 3))),
    trailLength: Math.max(0.1, Math.min(0.95, options.trailLength ?? 0.52)),
    baseOpacity: Math.max(0, Math.min(1, options.baseOpacity ?? 0.35)),
    brightness: options.brightness ?? 1,
    reverse: options.reverse ?? false,
    clampToGround: options.clampToGround ?? true,
    height: options.height ?? 0,
  };

  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.brightness, 'brightness');
  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }

  const material = new Material({
    fabric: useBatchColors
      ? {
          type: 'CesiumlabFlowPathBatched',
          uniforms: {
            u_time: 0,
            u_speed: state.speed,
            u_phase: phase,
            u_pulseCount: state.pulseCount,
            u_trailLength: state.trailLength,
            u_baseOpacity: state.baseOpacity,
            u_brightness: state.brightness,
            u_direction: state.reverse ? -1 : 1,
          },
          source: FLOW_PATH_BATCHED_SHADER_SOURCE,
        }
      : {
          type: 'CesiumlabFlowPath',
          uniforms: {
            u_color: state.color,
            u_headColor: state.headColor,
            u_trailColor: state.trailColor,
            u_time: 0,
            u_speed: state.speed,
            u_phase: phase,
            u_pulseCount: state.pulseCount,
            u_trailLength: state.trailLength,
            u_baseOpacity: state.baseOpacity,
            u_brightness: state.brightness,
            u_direction: state.reverse ? -1 : 1,
          },
          source: FLOW_PATH_SHADER_SOURCE,
        },
    translucent: true,
  });

  const buildInstanceAttributes = (item: NormalizedFlowPath) => {
    if (!useBatchColors) return undefined;
    const pCol = resolveColor(item.color, state.color).clone();
    pCol.alpha =
      item.phase !== undefined && Number.isFinite(item.phase) ? ((item.phase % 1) + 1) % 1 : 0;
    const hCol = resolveColor(item.headColor, state.headColor);
    const tCol = resolveColor(item.trailColor, item.color !== undefined ? pCol : state.trailColor);
    return {
      pathColor: ColorGeometryInstanceAttribute.fromColor(pCol),
      headColor: ColorGeometryInstanceAttribute.fromColor(hCol),
      trailColor: ColorGeometryInstanceAttribute.fromColor(tCol),
    };
  };

  const buildGroundPrimitive = (): GroundPolylinePrimitive => {
    const geometryInstances = normalizedItems.map(
      (item) =>
        new GeometryInstance({
          id: item.id,
          geometry: new GroundPolylineGeometry({
            positions: item.positions.map(([lng, lat]) =>
              Cartesian3.fromDegrees(lng, lat, 0, ellipsoid),
            ),
            width,
            loop,
          }),
          attributes: buildInstanceAttributes(item),
        }),
    );

    return new GroundPolylinePrimitive({
      geometryInstances,
      appearance: new PolylineMaterialAppearance({
        material,
        translucent: true,
      }),
      classificationType,
      asynchronous: true,
    });
  };

  const buildAirPrimitive = (altitude: number): Primitive => {
    const geometryInstances = normalizedItems.map((item) => {
      const pts = item.positions.map(([lng, lat]) =>
        Cartesian3.fromDegrees(lng, lat, altitude, ellipsoid),
      );
      if (loop && pts.length >= 2 && !Cartesian3.equals(pts[0]!, pts[pts.length - 1]!)) {
        pts.push(pts[0]!);
      }
      return new GeometryInstance({
        id: item.id,
        geometry: new PolylineGeometry({
          positions: pts,
          width,
          arcType: ArcType.GEODESIC,
          vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
        attributes: buildInstanceAttributes(item),
      });
    });

    return new Primitive({
      geometryInstances,
      appearance: new PolylineMaterialAppearance({
        material,
        translucent: true,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          blending: BlendingState.ALPHA_BLEND,
        },
      }),
      asynchronous: true,
    });
  };

  let activeInGround = state.clampToGround;
  let primitive: GroundPolylinePrimitive | Primitive = activeInGround
    ? buildGroundPrimitive()
    : buildAirPrimitive(state.height);

  const getActiveCollection = () =>
    activeInGround
      ? (viewer.scene.groundPrimitives ?? viewer.scene.primitives)
      : viewer.scene.primitives;

  getActiveCollection().add(primitive);

  const swapPrimitive = (
    nextClamped: boolean,
    nextPrimitive: GroundPolylinePrimitive | Primitive,
  ) => {
    if (viewer.isDestroyed()) return;
    const wasVisible = primitive.show;
    getActiveCollection().remove(primitive);
    activeInGround = nextClamped;
    primitive = nextPrimitive;
    primitive.show = wasVisible;
    getActiveCollection().add(primitive);
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  const baseHandle = createPrimitiveEffectHandle<FlowPathUpdateOptions>({
    viewer,
    clock,
    getCollection: getActiveCollection,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
        if (!useBatchColors) {
          material.uniforms.u_color = state.color;
        }
        if (!state.hasCustomTrailColor && next.trailColor === undefined) {
          state.trailColor = state.color;
          if (!useBatchColors) {
            material.uniforms.u_trailColor = state.trailColor;
          }
        }
      }
      if (next.headColor !== undefined) {
        state.headColor = resolveColor(next.headColor, DEFAULT_HEAD_COLOR);
        if (!useBatchColors) {
          material.uniforms.u_headColor = state.headColor;
        }
      }
      if (next.trailColor !== undefined) {
        state.hasCustomTrailColor = true;
        state.trailColor = resolveColor(next.trailColor, state.color);
        if (!useBatchColors) {
          material.uniforms.u_trailColor = state.trailColor;
        }
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
      if (next.pulseCount !== undefined) {
        validatePositiveFinite(next.pulseCount, 'pulseCount');
        state.pulseCount = Math.max(1, Math.min(MAX_PULSES, Math.round(next.pulseCount)));
        material.uniforms.u_pulseCount = state.pulseCount;
      }
      if (next.trailLength !== undefined) {
        validatePositiveFinite(next.trailLength, 'trailLength');
        state.trailLength = Math.max(0.1, Math.min(0.95, next.trailLength));
        material.uniforms.u_trailLength = state.trailLength;
      }
      if (next.baseOpacity !== undefined) {
        validateNonNegativeFinite(next.baseOpacity, 'baseOpacity');
        state.baseOpacity = Math.max(0, Math.min(1, next.baseOpacity));
        material.uniforms.u_baseOpacity = state.baseOpacity;
      }
      if (next.brightness !== undefined) {
        validateNonNegativeFinite(next.brightness, 'brightness');
        state.brightness = next.brightness;
        material.uniforms.u_brightness = state.brightness;
      }
      if (next.reverse !== undefined) {
        state.reverse = next.reverse;
        material.uniforms.u_direction = state.reverse ? -1 : 1;
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
          state.clampToGround ? buildGroundPrimitive() : buildAirPrimitive(state.height),
        );
      } else if (heightChanged && !state.clampToGround) {
        swapPrimitive(false, buildAirPrimitive(state.height));
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });

  return {
    ...baseHandle,
    setPathStyle(id: string, style: FlowPathStylePatch) {
      if (baseHandle.isDestroyed() || !useBatchColors) return;
      // Persist override on the source item so toggling clampToGround preserves live edits
      const target = normalizedItems.find((item) => item.id === id);
      if (target) {
        if (style.color !== undefined) target.color = style.color;
        if (style.headColor !== undefined) target.headColor = style.headColor;
        if (style.trailColor !== undefined) target.trailColor = style.trailColor;
      }
      if (!primitive.ready) return;
      const attrs = primitive.getGeometryInstanceAttributes?.(id) as
        | {
            pathColor?: Uint8Array;
            headColor?: Uint8Array;
            trailColor?: Uint8Array;
          }
        | undefined;
      if (!attrs) return;
      if (style.color !== undefined && attrs.pathColor) {
        const c = resolveColor(style.color, state.color).clone();
        const prevPhaseByte = attrs.pathColor[3] ?? 0;
        const nextBytes = ColorGeometryInstanceAttribute.toValue(c);
        nextBytes[3] = prevPhaseByte;
        attrs.pathColor = nextBytes;
      }
      if (style.headColor !== undefined && attrs.headColor) {
        attrs.headColor = ColorGeometryInstanceAttribute.toValue(
          resolveColor(style.headColor, state.headColor),
        );
      }
      if (style.trailColor !== undefined && attrs.trailColor) {
        attrs.trailColor = ColorGeometryInstanceAttribute.toValue(
          resolveColor(style.trailColor, state.trailColor),
        );
      }
    },
  };
}
