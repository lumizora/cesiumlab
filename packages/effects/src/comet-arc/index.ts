import {
  ArcType,
  BlendingState,
  Cartesian3,
  Color,
  EllipsoidGeodesic,
  GeometryInstance,
  Material,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
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
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export interface CometArcOptions extends EffectBaseOptions {
  /** Origin [longitude, latitude] in degrees. */
  from: LngLat;
  /** Destination [longitude, latitude] in degrees. */
  to: LngLat;
  /** Arc, comet head, and trail color (Cesium Color or CSS string). Defaults to '#ffa31a'. */
  color?: ColorInput;
  /** Peak arc height in metres above the ellipsoid. Defaults to max(320_000, distance * 0.28). */
  height?: number;
  /** Screen-space ribbon width in pixels. Defaults to 14. */
  width?: number;
  /** Base cycle duration in seconds. Defaults to 3 + distance / 3_000_000. */
  duration?: number;
  /** Speed multiplier for the travelling comets. Defaults to 1. */
  speed?: number;
  /** Comet trail length as a fraction of the arc (0.04 to 0.75). Defaults to 0.24. */
  trailLength?: number;
  /** Number of staggered comets sharing the same arc (1 to 4). Defaults to 1. */
  cometCount?: number;
  /** Opacity of the static glowing base arc (0 to 1). Defaults to 0.45. */
  baseOpacity?: number;
  /** Brightness multiplier for the comet head and trail. Defaults to 1. */
  brightness?: number;
  /** Initial normalized phase offset in [0, 1). Defaults to 0. */
  phase?: number;
  /** Invoked each time the primary comet completes a trip and reaches `to`. */
  onArrive?: () => void;
}

export type CometArcUpdateOptions = Pick<
  CometArcOptions,
  'color' | 'height' | 'speed' | 'trailLength' | 'cometCount' | 'baseOpacity' | 'brightness'
>;

export type CometArcHandle = EffectHandle<CometArcUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#ffa31a');
const ARC_SEGMENTS = 96;
const MAX_COMETS = 4;

const COMET_ARC_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_duration;
uniform float u_speed;
uniform float u_phase;
uniform float u_trailLength;
uniform float u_cometCount;
uniform float u_baseOpacity;
uniform float u_brightness;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Normalized distance from polyline centerline: 0 at center, 1 at ribbon edge.
  float d = abs(st.t - 0.5) * 2.0;

  // Softly fade both ends of the static base arc.
  float arcEnds = smoothstep(0.0, 0.03, st.s) * smoothstep(1.0, 0.97, st.s);

  // Dual-layer static base curve: crisp core + soft outer aura.
  float baseCore = exp(-d * d * 26.0) * u_baseOpacity * 0.72;
  float baseHalo = exp(-d * d * 4.2) * u_baseOpacity * 0.24;
  float baseAlpha = (baseCore + baseHalo) * arcEnds;

  float cometEnergy = 0.0;
  float headEnergy = 0.0;
  float count = clamp(u_cometCount, 1.0, 4.0);

  for (int i = 0; i < 4; i++) {
    if (float(i) >= count) {
      break;
    }
    float offset = float(i) / count;
    float head = fract((u_time * u_speed) / u_duration + u_phase + offset);
    float env = smoothstep(0.0, 0.045, head) * smoothstep(1.0, 0.955, head);

    // Tapered comet tail behind the head (narrowing cleanly from head to tip).
    float behind = head - st.s;
    if (behind >= 0.0 && behind <= u_trailLength) {
      float tailFrac = behind / max(0.001, u_trailLength);
      float taperWidth = mix(0.82, 0.16, pow(tailFrac, 0.75));
      float dTaper = d / taperWidth;
      float radial = exp(-dTaper * dTaper * 5.2);
      float longitudinal = pow(1.0 - tailFrac, 2.0);
      cometEnergy += radial * longitudinal * env;
    }

    // Seamless luminous comet head fused directly into the ribbon.
    float ds = (st.s - head) / max(0.006, u_trailLength * 0.11);
    float headDist2 = ds * ds + d * d * 2.2;
    float headGlow = exp(-headDist2 * 3.8) * env;
    float headCore = exp(-headDist2 * 14.0) * env;
    cometEnergy += headGlow * 0.85;
    headEnergy += headCore;
  }

  cometEnergy *= u_brightness;
  headEnergy *= u_brightness;

  float totalAlpha = clamp(baseAlpha + cometEnergy * 0.92 + headEnergy * 0.65, 0.0, 1.0);
  float whiteMix = clamp(headEnergy * 0.88 + cometEnergy * 0.28 + baseCore * 0.15, 0.0, 0.96);
  vec3 tint = mix(u_color.rgb, vec3(1.0), whiteMix);

  material.diffuse = tint;
  material.emission = tint * (0.7 + 0.65 * clamp(cometEnergy + headEnergy, 0.0, 1.4));
  material.alpha = totalAlpha;
  return material;
}
`;

function buildArcPositions(
  geodesic: EllipsoidGeodesic,
  height: number,
  ellipsoid: Viewer['scene']['ellipsoid'],
): Cartesian3[] {
  const positions: Cartesian3[] = [];
  for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
    const fraction = index / ARC_SEGMENTS;
    const cartographic = geodesic.interpolateUsingFraction(fraction);
    positions.push(
      Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        Math.sin(Math.PI * fraction) * height,
        ellipsoid,
      ),
    );
  }
  return positions;
}

/**
 * Adds a GPU-driven 3D geodesic comet arc rendered as a single Primitive with
 * a custom GLSL shader for the static base curve, tapered comet trail, and seamless head.
 */
export function createCometArc(viewer: Viewer, options: CometArcOptions): CometArcHandle {
  const ellipsoid = viewer.scene.ellipsoid;
  const start = validateLngLat(options.from, 'from');
  const end = validateLngLat(options.to, 'to');

  const angle = Cartesian3.angleBetween(
    ellipsoid.cartographicToCartesian(start),
    ellipsoid.cartographicToCartesian(end),
  );
  if (angle < 1e-12) {
    throw new RangeError('The start and end coordinates must differ.');
  }
  if (Math.PI - angle < 0.0125) {
    throw new RangeError('The start and end coordinates are too close to antipodal.');
  }

  const geodesic = new EllipsoidGeodesic(start, end, ellipsoid);
  const distance = geodesic.surfaceDistance;
  const duration = options.duration ?? 3 + distance / 3_000_000;
  const width = options.width ?? 14;
  const phase = options.phase ?? 0;

  validatePositiveFinite(duration, 'duration');
  validatePositiveFinite(width, 'width');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    height: options.height ?? Math.max(320_000, distance * 0.28),
    speed: options.speed ?? 1,
    trailLength: options.trailLength ?? 0.24,
    cometCount: options.cometCount ?? 1,
    baseOpacity: options.baseOpacity ?? 0.45,
    brightness: options.brightness ?? 1,
  };

  validatePositiveFinite(state.height, 'height');
  validatePositiveFinite(state.speed, 'speed');
  validatePositiveFinite(state.trailLength, 'trailLength');
  if (
    !Number.isInteger(state.cometCount) ||
    state.cometCount < 1 ||
    state.cometCount > MAX_COMETS
  ) {
    throw new RangeError(`Expected cometCount to be an integer in [1, ${MAX_COMETS}].`);
  }
  validateNonNegativeFinite(state.baseOpacity, 'baseOpacity');
  validateNonNegativeFinite(state.brightness, 'brightness');

  const material = new Material({
    fabric: {
      type: 'CesiumlabCometArc',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_duration: duration,
        u_speed: state.speed,
        u_phase: phase,
        u_trailLength: state.trailLength,
        u_cometCount: state.cometCount,
        u_baseOpacity: state.baseOpacity,
        u_brightness: state.brightness,
      },
      source: COMET_ARC_SHADER_SOURCE,
    },
    translucent: true,
  });

  const createArcPrimitive = (height: number): Primitive =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new PolylineGeometry({
          positions: buildArcPositions(geodesic, height, ellipsoid),
          width,
          arcType: ArcType.NONE,
          vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new PolylineMaterialAppearance({
        material,
        translucent: true,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          blending: BlendingState.ADDITIVE_BLEND,
        },
      }),
      asynchronous: false,
    });

  let primitive = createArcPrimitive(state.height);
  viewer.scene.primitives.add(primitive);

  let lastProgress = ((phase % 1) + 1) % 1;
  const progressFor = (elapsedSeconds: number) =>
    ((((elapsedSeconds * state.speed) / duration + phase) % 1) + 1) % 1;

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
    const currentProgress = progressFor(elapsedSeconds);
    if (currentProgress < lastProgress) {
      options.onArrive?.();
    }
    lastProgress = currentProgress;
  });

  return createPrimitiveEffectHandle<CometArcUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
        material.uniforms.u_color = state.color;
      }
      if (next.speed !== undefined) {
        validatePositiveFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
      if (next.trailLength !== undefined) {
        validatePositiveFinite(next.trailLength, 'trailLength');
        state.trailLength = next.trailLength;
        material.uniforms.u_trailLength = state.trailLength;
      }
      if (next.cometCount !== undefined) {
        if (
          !Number.isInteger(next.cometCount) ||
          next.cometCount < 1 ||
          next.cometCount > MAX_COMETS
        ) {
          throw new RangeError(`Expected cometCount to be an integer in [1, ${MAX_COMETS}].`);
        }
        state.cometCount = next.cometCount;
        material.uniforms.u_cometCount = state.cometCount;
      }
      if (next.baseOpacity !== undefined) {
        validateNonNegativeFinite(next.baseOpacity, 'baseOpacity');
        state.baseOpacity = next.baseOpacity;
        material.uniforms.u_baseOpacity = state.baseOpacity;
      }
      if (next.brightness !== undefined) {
        validateNonNegativeFinite(next.brightness, 'brightness');
        state.brightness = next.brightness;
        material.uniforms.u_brightness = state.brightness;
      }
      if (next.height !== undefined && next.height !== state.height) {
        validatePositiveFinite(next.height, 'height');
        state.height = next.height;
        if (!viewer.isDestroyed()) {
          viewer.scene.primitives.remove(primitive);
          primitive = createArcPrimitive(state.height);
          viewer.scene.primitives.add(primitive);
        }
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
      lastProgress = ((phase % 1) + 1) % 1;
    },
  });
}
