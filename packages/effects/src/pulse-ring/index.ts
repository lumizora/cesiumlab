import {
  BlendingState,
  BoundingSphere,
  Cartesian3,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Material,
  MaterialAppearance,
  Matrix4,
  Primitive,
  PrimitiveType,
  Transforms,
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
  sampleGroundHeight,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export type PulseRingMode = 'loop' | 'trigger';

export interface PulseRingOptions extends EffectBaseOptions {
  /** Center [longitude, latitude] in degrees. */
  position: LngLat;
  /** Ring color (Cesium Color or CSS string). Defaults to '#00a8ff' in loop mode, '#ffa31a' in trigger mode. */
  color?: ColorInput;
  /** Continuous staggered `'loop'` mode or event-driven `'trigger'` bursts. Defaults to 'loop'. */
  mode?: PulseRingMode;
  /** Inner starting radius in metres. Defaults to 8_000 (loop) or 25_000 (trigger). */
  minRadius?: number;
  /** Outer maximum radius in metres. Defaults to 180_000 (loop) or 760_000 (trigger). */
  maxRadius?: number;
  /** Height offset above ground in metres. Defaults to 2_000. */
  height?: number;
  /** Number of staggered rings (1 to 6). Defaults to 3 (loop) or 2 (trigger). */
  ringCount?: number;
  /** Lifetime of a single ring in seconds. Defaults to 2.6 (loop) or 1.4 (trigger). */
  duration?: number;
  /** Speed multiplier for ring expansion. Defaults to 1. */
  speed?: number;
  /** Initial phase offset in [0, 1) for loop mode. Defaults to 0. */
  phase?: number;
}

export type PulseRingUpdateOptions = Pick<
  PulseRingOptions,
  'color' | 'minRadius' | 'maxRadius' | 'ringCount' | 'speed'
>;

export interface PulseRingHandle extends EffectHandle<PulseRingUpdateOptions> {
  /** Fires a burst in `'trigger'` mode (coalesced while a burst is active). */
  trigger(): void;
}

const DEFAULT_LOOP_COLOR = Color.fromCssColorString('#00a8ff');
const DEFAULT_TRIGGER_COLOR = Color.fromCssColorString('#ffa31a');
const MAX_RINGS = 6;

const PULSE_RING_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_duration;
uniform float u_speed;
uniform float u_phase;
uniform float u_minRatio;
uniform float u_ringCount;
uniform float u_mode;
uniform float u_triggerTime;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 centered = materialInput.st * 2.0 - 1.0;
  float r = length(centered);

  if (r > 1.0) {
    material.alpha = 0.0;
    return material;
  }

  float edgeEnergy = 0.0;
  float wakeEnergy = 0.0;
  float count = clamp(u_ringCount, 1.0, 6.0);

  if (u_mode < 0.5) {
    // Continuous staggered radar ripples: sharp bright leading edge + soft inward wake.
    for (int i = 0; i < 6; i++) {
      if (float(i) >= count) {
        break;
      }
      float p = fract((u_time * u_speed) / u_duration + u_phase + float(i) / count);
      float eased = 1.0 - pow(1.0 - p, 1.35);
      float ringR = mix(u_minRatio, 0.98, eased);
      float fade = smoothstep(0.0, 0.08, p) * pow(1.0 - p, 1.35);

      float edge = exp(-pow((r - ringR) / 0.016, 2.0));
      float behind = (ringR - r) / 0.16;
      float wake = (behind >= 0.0 && behind <= 1.0) ? pow(1.0 - behind, 2.4) * 0.34 : 0.0;

      edgeEnergy += edge * fade;
      wakeEnergy += wake * fade;
    }

    // Subtle crisp center beacon that leaves surrounding map imagery clear.
    float centerDot = exp(-r * r * 260.0) * 0.45;
    edgeEnergy += centerDot;
  } else if (u_triggerTime >= 0.0) {
    // Event-driven high-energy burst with ease-out deceleration.
    float age = (u_time - u_triggerTime) * u_speed;
    if (age >= 0.0) {
      for (int i = 0; i < 6; i++) {
        if (float(i) >= count) {
          break;
        }
        float p = (age - float(i) * 0.14) / u_duration;
        if (p >= 0.0 && p < 1.0) {
          float eased = 1.0 - pow(1.0 - p, 2.35);
          float ringR = mix(u_minRatio, 0.98, eased);
          float fade = smoothstep(0.0, 0.05, p) * pow(1.0 - p, 1.15);

          float edge = exp(-pow((r - ringR) / 0.022, 2.0));
          float behind = (ringR - r) / 0.2;
          float wake = (behind >= 0.0 && behind <= 1.0) ? pow(1.0 - behind, 2.1) * 0.42 : 0.0;

          edgeEnergy += edge * fade * 1.15;
          wakeEnergy += wake * fade * 1.1;
        }
      }

      // Hollow center flash ring decaying over 0.45s without washing out map imagery.
      float flashDecay = pow(max(0.0, 1.0 - age / 0.45), 2.0);
      float flashRing = exp(-pow((r - 0.12) / 0.035, 2.0)) * flashDecay * 0.65;
      edgeEnergy += flashRing;
    }
  }

  float outerClip = smoothstep(1.0, 0.94, r);
  float alpha = clamp((edgeEnergy * 0.85 + wakeEnergy * 0.7) * outerClip, 0.0, 0.92);
  vec3 tint = mix(u_color.rgb, vec3(1.0), clamp(edgeEnergy * 0.55, 0.0, 0.78));

  material.diffuse = tint;
  material.emission = tint * (0.65 + 0.45 * clamp(edgeEnergy, 0.0, 1.0));
  material.alpha = alpha;
  return material;
}
`;

/** Builds a unit horizontal quad in local ENU space (x, y in [-1, 1], z = 0). */
function createDiscQuadGeometry(): Geometry {
  const positions = new Float64Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const sts = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: positions,
  });
  attributes.normal = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 3,
    values: normals,
  });
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: sts,
  });

  return new Geometry({
    attributes,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: new BoundingSphere(Cartesian3.ZERO, Math.SQRT2),
  });
}

function buildDiscMatrix(enuFrame: Matrix4, radius: number): Matrix4 {
  return Matrix4.multiply(
    enuFrame,
    Matrix4.fromScale(new Cartesian3(radius, radius, 1)),
    new Matrix4(),
  );
}

/**
 * Adds a GPU-driven radar ripple effect rendered as a single ENU disc Primitive
 * with crisp leading wavefronts and soft inward trailing wakes.
 */
export function createPulseRing(viewer: Viewer, options: PulseRingOptions): PulseRingHandle {
  validateLngLat(options.position, 'position');
  const mode: PulseRingMode = options.mode ?? 'loop';
  const defaultColor = mode === 'trigger' ? DEFAULT_TRIGGER_COLOR : DEFAULT_LOOP_COLOR;

  const duration = options.duration ?? (mode === 'trigger' ? 1.4 : 2.6);
  const heightOffset = options.height ?? 2_000;
  const phase = options.phase ?? 0;

  validatePositiveFinite(duration, 'duration');
  validateNonNegativeFinite(heightOffset, 'height');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const state = {
    color: resolveColor(options.color, defaultColor),
    minRadius: options.minRadius ?? (mode === 'trigger' ? 25_000 : 8_000),
    maxRadius: options.maxRadius ?? (mode === 'trigger' ? 760_000 : 180_000),
    ringCount: options.ringCount ?? (mode === 'trigger' ? 2 : 3),
    speed: options.speed ?? 1,
  };

  validateNonNegativeFinite(state.minRadius, 'minRadius');
  validatePositiveFinite(state.maxRadius, 'maxRadius');
  if (!Number.isInteger(state.ringCount) || state.ringCount < 1 || state.ringCount > MAX_RINGS) {
    throw new RangeError(`Expected ringCount to be an integer in [1, ${MAX_RINGS}].`);
  }
  validatePositiveFinite(state.speed, 'speed');

  const ground = sampleGroundHeight(viewer, options.position);
  const anchor = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    ground + heightOffset,
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, viewer.scene.ellipsoid);

  let triggerTime = -1;

  const material = new Material({
    fabric: {
      type: 'CesiumlabPulseRing',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_duration: duration,
        u_speed: state.speed,
        u_phase: phase,
        u_minRatio: Math.min(0.9, state.minRadius / state.maxRadius),
        u_ringCount: state.ringCount,
        u_mode: mode === 'trigger' ? 1.0 : 0.0,
        u_triggerTime: triggerTime,
      },
      source: PULSE_RING_SHADER_SOURCE,
    },
    translucent: true,
  });

  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createDiscQuadGeometry(),
    }),
    appearance: new MaterialAppearance({
      material,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ADDITIVE_BLEND,
        cull: { enabled: false },
      },
    }),
    modelMatrix: buildDiscMatrix(enuFrame, state.maxRadius),
    asynchronous: false,
  });

  viewer.scene.primitives.add(primitive);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  const isBurstActive = () => {
    if (triggerTime < 0) return false;
    const totalBurstTime = duration + (state.ringCount - 1) * 0.14;
    return (clock.elapsed() - triggerTime) * state.speed < totalBurstTime;
  };

  const baseHandle = createPrimitiveEffectHandle<PulseRingUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, defaultColor);
        material.uniforms.u_color = state.color;
      }
      if (next.minRadius !== undefined) {
        validateNonNegativeFinite(next.minRadius, 'minRadius');
        state.minRadius = next.minRadius;
      }
      if (next.maxRadius !== undefined) {
        validatePositiveFinite(next.maxRadius, 'maxRadius');
        state.maxRadius = next.maxRadius;
        primitive.modelMatrix = buildDiscMatrix(enuFrame, state.maxRadius);
      }
      if (next.minRadius !== undefined || next.maxRadius !== undefined) {
        material.uniforms.u_minRatio = Math.min(0.9, state.minRadius / state.maxRadius);
      }
      if (next.ringCount !== undefined) {
        if (!Number.isInteger(next.ringCount) || next.ringCount < 1 || next.ringCount > MAX_RINGS) {
          throw new RangeError(`Expected ringCount to be an integer in [1, ${MAX_RINGS}].`);
        }
        state.ringCount = next.ringCount;
        material.uniforms.u_ringCount = state.ringCount;
      }
      if (next.speed !== undefined) {
        validatePositiveFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
    },
    onRestart() {
      triggerTime = -1;
      material.uniforms.u_time = 0;
      material.uniforms.u_triggerTime = -1;
    },
  });

  return {
    ...baseHandle,
    trigger() {
      if (baseHandle.isDestroyed() || mode !== 'trigger' || isBurstActive()) return;
      triggerTime = clock.elapsed();
      material.uniforms.u_triggerTime = triggerTime;
    },
  };
}
