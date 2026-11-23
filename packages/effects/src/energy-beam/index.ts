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

export interface EnergyBeamOptions extends EffectBaseOptions {
  /** Base [longitude, latitude] in degrees. */
  position: LngLat;
  /** Beam glow color (Cesium Color or CSS string). Defaults to '#00a8ff'. */
  color?: ColorInput;
  /** Vertical beam height in metres above ground. Defaults to 520_000. */
  height?: number;
  /** Base outer radius in metres. Defaults to height * 0.045. */
  radius?: number;
  /** Bright inner core width multiplier. Defaults to 1. */
  coreWidth?: number;
  /** Outer volumetric glow width multiplier. Defaults to 1. */
  glowWidth?: number;
  /** Overall intensity / opacity multiplier. Defaults to 1. */
  intensity?: number;
  /** Breathing oscillation speed multiplier. Defaults to 1. */
  breathingSpeed?: number;
  /** Upward holographic energy flow speed multiplier. Defaults to 1. */
  flowSpeed?: number;
  /** Ground altitude offset in metres. Defaults to 0. */
  groundOffset?: number;
  /** Initial animation phase offset in radians. Defaults to 0. */
  phase?: number;
}

export type EnergyBeamUpdateOptions = Pick<
  EnergyBeamOptions,
  | 'color'
  | 'height'
  | 'radius'
  | 'coreWidth'
  | 'glowWidth'
  | 'intensity'
  | 'breathingSpeed'
  | 'flowSpeed'
>;

export type EnergyBeamHandle = EffectHandle<EnergyBeamUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#00a8ff');
const BEAM_SLICES = 48;

const BEAM_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_intensity;
uniform float u_edgePower;
uniform float u_verticalPower;
uniform float u_coreMix;
uniform float u_flowSpeed;
uniform float u_breathingSpeed;
uniform float u_phase;
uniform float u_scanStrength;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Smooth volumetric edge falloff: brightest at cylinder axis, zero at silhouette.
  float ndotv = abs(dot(normalize(materialInput.normalEC), normalize(materialInput.positionToEyeEC)));
  float radial = pow(clamp(ndotv, 0.0, 1.0), u_edgePower);

  // Smooth vertical envelope: soft entry at base, exponential fade to zero at tip.
  float baseFade = smoothstep(0.0, 0.08, st.t);
  float topFade = pow(clamp(1.0 - st.t, 0.0, 1.0), u_verticalPower);
  float vertical = baseFade * topFade;

  // Upward holographic energy bands + subtle vertical light streaks.
  float waveA = 0.5 + 0.5 * sin((st.t * 6.0 - u_time * u_flowSpeed * 0.85) * 6.2831853 + u_phase);
  float waveB = 0.5 + 0.5 * sin((st.t * 14.0 - u_time * u_flowSpeed * 1.65) * 6.2831853 - u_phase);
  float streaks = 0.86 + 0.14 * sin(st.s * 6.2831853 * 8.0 + u_time * 0.45 + u_phase);
  float hologram = mix(1.0, (0.68 + 0.22 * waveA + 0.14 * waveB) * streaks, u_scanStrength);

  // Gentle breathing modulation.
  float breath = u_breathingSpeed > 0.0
    ? 0.92 + 0.08 * sin(u_time * u_breathingSpeed * 1.4 + u_phase)
    : 1.0;

  // Keep center luminous without clipping daytime map imagery to pure white.
  float hot = clamp(radial * (1.0 - st.t * 0.65), 0.0, 1.0);
  vec3 tint = mix(u_color.rgb, vec3(1.0), clamp(u_coreMix + hot * 0.18, 0.0, 0.82));

  float alpha = clamp(radial * vertical * hologram * breath * u_intensity * u_color.a, 0.0, 0.85);
  material.diffuse = tint;
  material.emission = tint * (0.55 + 0.28 * hot);
  material.alpha = alpha;
  return material;
}
`;

const BASE_GLOW_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_intensity;
uniform float u_breathingSpeed;
uniform float u_phase;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 centered = materialInput.st * 2.0 - 1.0;
  float dist = length(centered);

  // Keep the center translucent so underlying map imagery remains clearly visible,
  // with a subtle holographic ground ring around the beam footprint.
  float softHalo = exp(-dist * dist * 4.2) * smoothstep(1.0, 0.35, dist) * 0.16;
  float ring = exp(-pow((dist - 0.55) / 0.075, 2.0)) * 0.32;
  float innerRing = exp(-pow((dist - 0.28) / 0.055, 2.0)) * 0.18;
  float breath = u_breathingSpeed > 0.0
    ? 0.92 + 0.08 * sin(u_time * u_breathingSpeed * 1.4 + u_phase)
    : 1.0;

  vec3 tint = mix(u_color.rgb, vec3(1.0), clamp(ring * 0.6, 0.0, 0.45));
  float alpha = clamp((softHalo + ring + innerRing) * breath * u_intensity * u_color.a, 0.0, 0.55);

  material.diffuse = tint;
  material.emission = tint * 0.5;
  material.alpha = alpha;
  return material;
}
`;

/**
 * Builds an open-ended tapered unit cylinder in local ENU space:
 * z in [0, 1], bottom radius = 1, top radius = topRatio, outward unit normals,
 * and continuous st.t in [0, 1] with zero endcaps.
 */
function createOpenBeamGeometry(topRatio: number, slices = BEAM_SLICES): Geometry {
  const vertexCount = (slices + 1) * 2;
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(slices * 6);

  for (let i = 0; i <= slices; i += 1) {
    const u = i / slices;
    const angle = u * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Bottom ring vertex (z = 0, radius = 1)
    const bottomIdx = i * 2;
    positions[bottomIdx * 3] = cosA;
    positions[bottomIdx * 3 + 1] = sinA;
    positions[bottomIdx * 3 + 2] = 0;
    normals[bottomIdx * 3] = cosA;
    normals[bottomIdx * 3 + 1] = sinA;
    normals[bottomIdx * 3 + 2] = 0;
    sts[bottomIdx * 2] = u;
    sts[bottomIdx * 2 + 1] = 0;

    // Top ring vertex (z = 1, radius = topRatio)
    const topIdx = bottomIdx + 1;
    positions[topIdx * 3] = cosA * topRatio;
    positions[topIdx * 3 + 1] = sinA * topRatio;
    positions[topIdx * 3 + 2] = 1;
    normals[topIdx * 3] = cosA;
    normals[topIdx * 3 + 1] = sinA;
    normals[topIdx * 3 + 2] = 0;
    sts[topIdx * 2] = u;
    sts[topIdx * 2 + 1] = 1;
  }

  for (let i = 0; i < slices; i += 1) {
    const b0 = i * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    const offset = i * 6;
    indices[offset] = b0;
    indices[offset + 1] = b1;
    indices[offset + 2] = t1;
    indices[offset + 3] = b0;
    indices[offset + 4] = t1;
    indices[offset + 5] = t0;
  }

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
    boundingSphere: new BoundingSphere(new Cartesian3(0, 0, 0.5), Math.SQRT2),
  });
}

/** Builds a unit horizontal quad in local ENU space (x, y in [-1, 1], z = 0). */
function createBaseDiscGeometry(): Geometry {
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

function createAdditiveAppearance(material: Material): MaterialAppearance {
  return new MaterialAppearance({
    material,
    translucent: true,
    closed: false,
    renderState: {
      depthTest: { enabled: true },
      depthMask: false,
      blending: BlendingState.ADDITIVE_BLEND,
      cull: { enabled: false },
    },
  });
}

function buildScaledEnuMatrix(
  enuFrame: Matrix4,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): Matrix4 {
  return Matrix4.multiply(
    enuFrame,
    Matrix4.fromScale(new Cartesian3(scaleX, scaleY, scaleZ)),
    new Matrix4(),
  );
}

/**
 * Adds a continuous 3D volumetric holographic energy beam built from open-ended
 * tapered cylinder shells and custom GLSL Fresnel + energy-flow shaders.
 * Remains smooth and seamless at every camera zoom level.
 */
export function createEnergyBeam(viewer: Viewer, options: EnergyBeamOptions): EnergyBeamHandle {
  validateLngLat(options.position, 'position');

  const groundOffset = options.groundOffset ?? 0;
  const phase = options.phase ?? 0;
  const initialHeight = options.height ?? 520_000;
  const hasExplicitRadius = options.radius !== undefined;

  validateNonNegativeFinite(groundOffset, 'groundOffset');
  validatePositiveFinite(initialHeight, 'height');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    height: initialHeight,
    radius: options.radius ?? initialHeight * 0.045,
    autoRadius: !hasExplicitRadius,
    coreWidth: options.coreWidth ?? 1,
    glowWidth: options.glowWidth ?? 1,
    intensity: options.intensity ?? 1,
    breathingSpeed: options.breathingSpeed ?? 1,
    flowSpeed: options.flowSpeed ?? 1,
  };

  validatePositiveFinite(state.radius, 'radius');
  validatePositiveFinite(state.coreWidth, 'coreWidth');
  validatePositiveFinite(state.glowWidth, 'glowWidth');
  validateNonNegativeFinite(state.intensity, 'intensity');
  validateNonNegativeFinite(state.breathingSpeed, 'breathingSpeed');
  validateNonNegativeFinite(state.flowSpeed, 'flowSpeed');

  const ground = sampleGroundHeight(viewer, options.position);
  const anchor = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    ground + groundOffset,
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, viewer.scene.ellipsoid);

  const outerMaterial = new Material({
    fabric: {
      type: 'CesiumlabEnergyBeamOuter',
      uniforms: {
        u_color: state.color.withAlpha(0.42),
        u_time: 0,
        u_intensity: state.intensity,
        u_edgePower: 1.75,
        u_verticalPower: 1.55,
        u_coreMix: 0.1,
        u_flowSpeed: state.flowSpeed,
        u_breathingSpeed: state.breathingSpeed,
        u_phase: phase,
        u_scanStrength: 1.0,
      },
      source: BEAM_SHADER_SOURCE,
    },
    translucent: true,
  });

  const coreMaterial = new Material({
    fabric: {
      type: 'CesiumlabEnergyBeamCore',
      uniforms: {
        u_color: state.color.withAlpha(0.55),
        u_time: 0,
        u_intensity: state.intensity,
        u_edgePower: 2.3,
        u_verticalPower: 1.85,
        u_coreMix: 0.55,
        u_flowSpeed: state.flowSpeed * 1.2,
        u_breathingSpeed: state.breathingSpeed,
        u_phase: phase + 0.5,
        u_scanStrength: 0.45,
      },
      source: BEAM_SHADER_SOURCE,
    },
    translucent: true,
  });

  const baseMaterial = new Material({
    fabric: {
      type: 'CesiumlabEnergyBeamBase',
      uniforms: {
        u_color: state.color.withAlpha(0.65),
        u_time: 0,
        u_intensity: state.intensity,
        u_breathingSpeed: state.breathingSpeed,
        u_phase: phase,
      },
      source: BASE_GLOW_SHADER_SOURCE,
    },
    translucent: true,
  });

  const outerPrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createOpenBeamGeometry(0.72),
    }),
    appearance: createAdditiveAppearance(outerMaterial),
    modelMatrix: buildScaledEnuMatrix(
      enuFrame,
      state.radius * state.glowWidth,
      state.radius * state.glowWidth,
      state.height,
    ),
    asynchronous: false,
  });

  const corePrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createOpenBeamGeometry(0.55),
    }),
    appearance: createAdditiveAppearance(coreMaterial),
    modelMatrix: buildScaledEnuMatrix(
      enuFrame,
      state.radius * 0.34 * state.coreWidth,
      state.radius * 0.34 * state.coreWidth,
      state.height * 0.92,
    ),
    asynchronous: false,
  });

  const baseDiscRadius = state.radius * state.glowWidth * 1.45;
  const basePrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createBaseDiscGeometry(),
    }),
    appearance: createAdditiveAppearance(baseMaterial),
    modelMatrix: buildScaledEnuMatrix(enuFrame, baseDiscRadius, baseDiscRadius, 1),
    asynchronous: false,
  });

  const primitives = [outerPrimitive, corePrimitive, basePrimitive];
  for (const primitive of primitives) {
    viewer.scene.primitives.add(primitive);
  }

  const syncUniformsAndTransforms = () => {
    const outerRadius = state.radius * state.glowWidth;
    const coreRadius = state.radius * 0.34 * state.coreWidth;
    const baseRadius = outerRadius * 1.45;

    outerPrimitive.modelMatrix = buildScaledEnuMatrix(
      enuFrame,
      outerRadius,
      outerRadius,
      state.height,
    );
    corePrimitive.modelMatrix = buildScaledEnuMatrix(
      enuFrame,
      coreRadius,
      coreRadius,
      state.height * 0.92,
    );
    basePrimitive.modelMatrix = buildScaledEnuMatrix(enuFrame, baseRadius, baseRadius, 1);

    outerMaterial.uniforms.u_color = state.color.withAlpha(0.42);
    outerMaterial.uniforms.u_intensity = state.intensity;
    outerMaterial.uniforms.u_flowSpeed = state.flowSpeed;
    outerMaterial.uniforms.u_breathingSpeed = state.breathingSpeed;

    coreMaterial.uniforms.u_color = state.color.withAlpha(0.55);
    coreMaterial.uniforms.u_intensity = state.intensity;
    coreMaterial.uniforms.u_flowSpeed = state.flowSpeed * 1.2;
    coreMaterial.uniforms.u_breathingSpeed = state.breathingSpeed;

    baseMaterial.uniforms.u_color = state.color.withAlpha(0.65);
    baseMaterial.uniforms.u_intensity = state.intensity;
    baseMaterial.uniforms.u_breathingSpeed = state.breathingSpeed;
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    outerMaterial.uniforms.u_time = elapsedSeconds;
    coreMaterial.uniforms.u_time = elapsedSeconds;
    baseMaterial.uniforms.u_time = elapsedSeconds;
  });

  return createPrimitiveEffectHandle<EnergyBeamUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => primitives,
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
      }
      if (next.height !== undefined) {
        validatePositiveFinite(next.height, 'height');
        state.height = next.height;
        if (state.autoRadius) {
          state.radius = next.height * 0.045;
        }
      }
      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        state.radius = next.radius;
        state.autoRadius = false;
      }
      if (next.coreWidth !== undefined) {
        validatePositiveFinite(next.coreWidth, 'coreWidth');
        state.coreWidth = next.coreWidth;
      }
      if (next.glowWidth !== undefined) {
        validatePositiveFinite(next.glowWidth, 'glowWidth');
        state.glowWidth = next.glowWidth;
      }
      if (next.intensity !== undefined) {
        validateNonNegativeFinite(next.intensity, 'intensity');
        state.intensity = next.intensity;
      }
      if (next.breathingSpeed !== undefined) {
        validateNonNegativeFinite(next.breathingSpeed, 'breathingSpeed');
        state.breathingSpeed = next.breathingSpeed;
      }
      if (next.flowSpeed !== undefined) {
        validateNonNegativeFinite(next.flowSpeed, 'flowSpeed');
        state.flowSpeed = next.flowSpeed;
      }
      syncUniformsAndTransforms();
    },
    onRestart() {
      outerMaterial.uniforms.u_time = 0;
      coreMaterial.uniforms.u_time = 0;
      baseMaterial.uniforms.u_time = 0;
    },
  });
}
