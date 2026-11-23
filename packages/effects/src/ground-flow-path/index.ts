import {
  Cartesian3,
  ClassificationType,
  Color,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  Material,
  PolylineMaterialAppearance,
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

export interface GroundFlowPathOptions extends EffectBaseOptions {
  /** Ordered path vertices as [longitude, latitude] in degrees (minimum 2 points). */
  positions: readonly LngLat[];
  /** Path glow and pulse color (Cesium Color or CSS string). Defaults to '#00e5a0'. */
  color?: ColorInput;
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
  /** Close the path from the last vertex back to the first. Defaults to false. */
  loop?: boolean;
  /** Initial normalized animation phase offset in [0, 1). Defaults to 0. */
  phase?: number;
  /** Classification target for clamping (terrain, 3D Tiles, or both). Defaults to ClassificationType.BOTH. */
  classificationType?: ClassificationType;
}

export type GroundFlowPathUpdateOptions = Pick<
  GroundFlowPathOptions,
  'color' | 'speed' | 'pulseCount' | 'trailLength' | 'baseOpacity' | 'brightness' | 'reverse'
>;

export type GroundFlowPathHandle = EffectHandle<GroundFlowPathUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#00e5a0');
const MAX_PULSES = 8;

const GROUND_FLOW_PATH_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
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

  // Dual-layer static ground track: crisp luminous spine + soft outer halo.
  float baseCore = exp(-d * d * 20.0) * u_baseOpacity * 0.72;
  float baseHalo = exp(-d * d * 3.8) * u_baseOpacity * 0.28;
  float baseAlpha = baseCore + baseHalo;

  // Seamless periodic pulse streams along the terrain-clamped path.
  float count = clamp(u_pulseCount, 1.0, 8.0);
  float coord = u_direction > 0.0 ? st.s : (1.0 - st.s);
  float slotPos = fract(coord * count - u_time * u_speed * 0.42 + u_phase);

  // Signed periodic distance from the pulse head in [-0.5, 0.5):
  // >= 0 is behind the head (trailing wake), < 0 is ahead of the head (rounded nose).
  float behind = fract(1.0 - slotPos);
  float trailSpan = clamp(u_trailLength, 0.1, 0.95);
  float headSpan = max(0.025, trailSpan * 0.18);

  float pulseEnergy = 0.0;
  float headEnergy = 0.0;

  if (behind <= trailSpan) {
    float frac = behind / max(0.001, trailSpan);
    float taperWidth = mix(0.86, 0.2, pow(frac, 0.78));
    float dTaper = d / taperWidth;
    float radial = exp(-dTaper * dTaper * 5.0);
    float longitudinal = pow(1.0 - frac, 1.9);
    pulseEnergy = radial * longitudinal;
  } else {
    // Seamless C1-continuous rounded nose ahead of the pulse head matching exact width 0.86 at behind = 0.
    float ahead = 1.0 - behind;
    float dNose = d / 0.86;
    float radialNose = exp(-dNose * dNose * 5.0);
    float longNose = exp(-pow(ahead / headSpan, 2.0) * 4.0);
    pulseEnergy = radialNose * longNose;
  }

  // Smooth incandescent core centered inside the rounded pulse head.
  float headDist = min(behind, 1.0 - behind) / headSpan;
  float headDist2 = headDist * headDist * 2.2 + (d / 0.72) * (d / 0.72) * 3.0;
  headEnergy = exp(-headDist2 * 3.8) * u_brightness;
  pulseEnergy *= u_brightness;

  float totalAlpha = clamp(baseAlpha + pulseEnergy * 0.78 + headEnergy * 0.5, 0.0, 0.94);
  float whiteMix = clamp(headEnergy * 0.52 + pulseEnergy * 0.2 + baseCore * 0.12, 0.0, 0.62);
  vec3 tint = mix(u_color.rgb, vec3(1.0), whiteMix);

  material.diffuse = tint;
  material.emission = tint * (0.45 + 0.4 * clamp(pulseEnergy + headEnergy, 0.0, 1.2));
  material.alpha = totalAlpha;
  return material;
}
`;

/**
 * Adds a terrain- and 3D-Tiles-clamped GPU-driven luminous flowing path using
 * Cesium's GroundPolylinePrimitive and a custom GLSL shader.
 */
export function createGroundFlowPath(
  viewer: Viewer,
  options: GroundFlowPathOptions,
): GroundFlowPathHandle {
  if (!Array.isArray(options.positions) || options.positions.length < 2) {
    throw new RangeError('Expected positions to contain at least 2 [longitude, latitude] points.');
  }

  const ellipsoid = viewer.scene.ellipsoid;
  const cartesianPositions: Cartesian3[] = [];
  for (let i = 0; i < options.positions.length; i += 1) {
    const [lng, lat] = options.positions[i]!;
    validateLngLat([lng, lat], `positions[${i}]`);
    cartesianPositions.push(Cartesian3.fromDegrees(lng, lat, 0, ellipsoid));
  }

  const width = options.width ?? 10;
  const loop = options.loop ?? false;
  const phase = options.phase ?? 0;
  const classificationType = options.classificationType ?? ClassificationType.BOTH;

  validatePositiveFinite(width, 'width');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    speed: options.speed ?? 1,
    pulseCount: Math.max(1, Math.min(MAX_PULSES, Math.round(options.pulseCount ?? 3))),
    trailLength: Math.max(0.1, Math.min(0.95, options.trailLength ?? 0.52)),
    baseOpacity: Math.max(0, Math.min(1, options.baseOpacity ?? 0.35)),
    brightness: options.brightness ?? 1,
    reverse: options.reverse ?? false,
  };

  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.brightness, 'brightness');

  const material = new Material({
    fabric: {
      type: 'CesiumlabGroundFlowPath',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_speed: state.speed,
        u_phase: phase,
        u_pulseCount: state.pulseCount,
        u_trailLength: state.trailLength,
        u_baseOpacity: state.baseOpacity,
        u_brightness: state.brightness,
        u_direction: state.reverse ? -1 : 1,
      },
      source: GROUND_FLOW_PATH_SHADER_SOURCE,
    },
    translucent: true,
  });

  const primitive = new GroundPolylinePrimitive({
    geometryInstances: new GeometryInstance({
      geometry: new GroundPolylineGeometry({
        positions: cartesianPositions,
        width,
        loop,
      }),
    }),
    appearance: new PolylineMaterialAppearance({
      material,
      translucent: true,
    }),
    classificationType,
    asynchronous: true,
  });

  const collection = viewer.scene.groundPrimitives ?? viewer.scene.primitives;
  collection.add(primitive);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  return createPrimitiveEffectHandle<GroundFlowPathUpdateOptions>({
    viewer,
    clock,
    collection,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
        material.uniforms.u_color = state.color;
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
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });
}
