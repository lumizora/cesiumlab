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
  Matrix3,
  Matrix4,
  Primitive,
  PrimitiveType,
  Transforms,
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
  sampleGroundHeight,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export interface HoloBeaconOptions extends EffectBaseOptions {
  /** Anchor [longitude, latitude] in degrees. */
  position: LngLat;
  /** Beacon glow color (Cesium Color or CSS string). Defaults to '#38bdf8'. */
  color?: ColorInput;
  /** Floating height of the crystal center above ground in metres. Defaults to 120_000. */
  altitude?: number;
  /** Radius of the floating octahedron crystal in metres. Defaults to 28_000. */
  size?: number;
  /** Ground lock-on ring radius in metres. Defaults to size * 2.2. */
  ringRadius?: number;
  /** Crystal self-rotation speed multiplier. Defaults to 1. */
  spinSpeed?: number;
  /** Vertical bobbing speed multiplier. Defaults to 1. */
  bobSpeed?: number;
  /** Vertical bobbing amplitude as a fraction of `size`. Defaults to 0.28. */
  bobAmplitude?: number;
  /** Overall opacity multiplier. Defaults to 0.9. */
  opacity?: number;
  /** Vertical offset above sampled ground elevation in metres. Defaults to 0. */
  groundOffset?: number;
  /** Initial animation phase offset in radians. Defaults to 0. */
  phase?: number;
}

export type HoloBeaconUpdateOptions = Pick<
  HoloBeaconOptions,
  | 'color'
  | 'altitude'
  | 'size'
  | 'ringRadius'
  | 'spinSpeed'
  | 'bobSpeed'
  | 'bobAmplitude'
  | 'opacity'
>;

export type HoloBeaconHandle = EffectHandle<HoloBeaconUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#38bdf8');

const CRYSTAL_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_opacity;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Barycentric edge distance inside each triangular crystal facet:
  // st = (u, v) where u >= 0, v >= 0, 1 - u - v >= 0.
  float edgeDist = min(min(st.s, st.t), max(0.0, 1.0 - st.s - st.t));
  float px = max(fwidth(edgeDist), 0.008);
  float edgeLine = 1.0 - smoothstep(0.0, px * 2.4 + 0.032, edgeDist);

  // Fresnel rim glow for crisp 3D holographic crystal silhouette.
  float ndotv = abs(dot(normalize(materialInput.normalEC), normalize(materialInput.positionToEyeEC)));
  float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.75);

  // Subtle internal vertical scan pulse.
  float pulse = 0.85 + 0.15 * sin(u_time * 3.0);

  float facetAlpha = (0.16 + fresnel * 0.42 + edgeLine * 0.62) * pulse;
  float highlight = clamp(edgeLine * 0.42 + fresnel * 0.18, 0.0, 0.5);
  vec3 tint = mix(u_color.rgb, vec3(1.0), highlight);

  material.diffuse = vec3(0.0);
  material.emission = tint;
  material.alpha = clamp(facetAlpha * u_opacity, 0.0, 0.86);
  return material;
}
`;

const TETHER_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_opacity;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  float endFade = smoothstep(0.0, 0.08, st.t) * smoothstep(1.0, 0.88, st.t);
  float pulse = pow(0.5 + 0.5 * sin((st.t * 3.0 - u_time * 1.8) * 6.2831853), 4.0);
  float alpha = (0.28 + 0.42 * pulse) * endFade * u_opacity;

  vec3 tint = mix(u_color.rgb, vec3(1.0), pulse * 0.35);
  material.diffuse = vec3(0.0);
  material.emission = tint;
  material.alpha = clamp(alpha, 0.0, 0.8);
  return material;
}
`;

const RING_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_opacity;

const float TWO_PI = 6.28318530718;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 centered = materialInput.st * 2.0 - 1.0;
  float r = length(centered);

  if (r > 1.0) {
    material.alpha = 0.0;
    return material;
  }

  float px = max(length(fwidth(centered)), 0.002);
  float theta = atan(centered.y, centered.x);

  // Rotating segmented outer targeting ring (4 dashed arcs).
  float rotA = theta - u_time * 0.8;
  float segMask = smoothstep(-0.1, 0.1, cos(rotA * 4.0));
  float outerArc = exp(-pow((r - 0.92) / clamp(px * 2.0, 0.012, 0.032), 2.0)) * (0.25 + 0.65 * segMask);

  // Counter-rotating inner precision ring.
  float rotB = theta + u_time * 1.2;
  float tickMask = smoothstep(0.2, 0.45, cos(rotB * 8.0));
  float innerRing = exp(-pow((r - 0.58) / clamp(px * 1.6, 0.008, 0.022), 2.0)) * (0.2 + 0.4 * tickMask);

  // Soft expanding lock-on breath wave.
  float waveR = fract(u_time * 0.45);
  float wave = exp(-pow((r - waveR) / 0.045, 2.0)) * (1.0 - waveR) * 0.35;

  // Center anchor dot.
  float centerDot = exp(-pow(r / clamp(px * 4.0, 0.035, 0.08), 2.0)) * 0.6;

  float energy = (outerArc + innerRing + wave + centerDot) * smoothstep(1.0, 0.95, r);
  vec3 tint = mix(u_color.rgb, vec3(1.0), clamp(outerArc * 0.25 + centerDot * 0.3, 0.0, 0.38));

  material.diffuse = tint;
  material.emission = tint * 0.35;
  material.alpha = clamp(energy * u_opacity, 0.0, 0.82);
  return material;
}
`;

/**
 * Builds an elongated unit octahedron centered at (0, 0, 0) with exact barycentric st coordinates
 * per facet for crisp holographic edge rendering.
 */
function createOctahedronGeometry(): Geometry {
  const top: [number, number, number] = [0, 0, 1.35];
  const bottom: [number, number, number] = [0, 0, -1.35];
  const ring: readonly [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [-1, 0, 0],
    [0, -1, 0],
  ];

  const faces: Array<
    [[number, number, number], [number, number, number], [number, number, number]]
  > = [];
  for (let i = 0; i < 4; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    faces.push([top, a, b]);
    faces.push([bottom, b, a]);
  }

  const vertexCount = faces.length * 3;
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(vertexCount);

  const barycentric: readonly [number, number][] = [
    [1, 0],
    [0, 1],
    [0, 0],
  ];

  const p0 = new Cartesian3();
  const p1 = new Cartesian3();
  const p2 = new Cartesian3();
  const e1 = new Cartesian3();
  const e2 = new Cartesian3();
  const n = new Cartesian3();

  for (let f = 0; f < faces.length; f += 1) {
    const [v0, v1, v2] = faces[f]!;
    Cartesian3.fromArray(v0, 0, p0);
    Cartesian3.fromArray(v1, 0, p1);
    Cartesian3.fromArray(v2, 0, p2);
    Cartesian3.subtract(p1, p0, e1);
    Cartesian3.subtract(p2, p0, e2);
    Cartesian3.cross(e1, e2, n);
    Cartesian3.normalize(n, n);

    const verts = [v0, v1, v2] as const;
    for (let k = 0; k < 3; k += 1) {
      const idx = f * 3 + k;
      const v = verts[k]!;
      const uv = barycentric[k]!;
      positions[idx * 3] = v[0];
      positions[idx * 3 + 1] = v[1];
      positions[idx * 3 + 2] = v[2];
      normals[idx * 3] = n.x;
      normals[idx * 3 + 1] = n.y;
      normals[idx * 3 + 2] = n.z;
      sts[idx * 2] = uv[0];
      sts[idx * 2 + 1] = uv[1];
      indices[idx] = idx;
    }
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
    boundingSphere: new BoundingSphere(Cartesian3.ZERO, 1.5),
  });
}

/** Builds a slim open-ended unit cylinder (z in [0, 1], radius = 1) for the vertical tether line. */
function createTetherGeometry(slices = 16): Geometry {
  const vertexCount = (slices + 1) * 2;
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(slices * 6);

  for (let i = 0; i <= slices; i += 1) {
    const u = i / slices;
    const angle = u * Math.PI * 2;
    const isZero = i === 0 || i === slices;
    const isPi = i * 2 === slices;
    const cosA = isZero ? 1 : isPi ? -1 : Math.cos(angle);
    const sinA = isZero || isPi ? 0 : Math.sin(angle);

    const bIdx = i * 2;
    positions[bIdx * 3] = cosA;
    positions[bIdx * 3 + 1] = sinA;
    positions[bIdx * 3 + 2] = 0;
    normals[bIdx * 3] = cosA;
    normals[bIdx * 3 + 1] = sinA;
    normals[bIdx * 3 + 2] = 0;
    sts[bIdx * 2] = u;
    sts[bIdx * 2 + 1] = 0;

    const tIdx = bIdx + 1;
    positions[tIdx * 3] = cosA;
    positions[tIdx * 3 + 1] = sinA;
    positions[tIdx * 3 + 2] = 1;
    normals[tIdx * 3] = cosA;
    normals[tIdx * 3 + 1] = sinA;
    normals[tIdx * 3 + 2] = 0;
    sts[tIdx * 2] = u;
    sts[tIdx * 2 + 1] = 1;
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

function createRingQuadGeometry(): Geometry {
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

function buildCrystalMatrix(
  enuFrame: Matrix4,
  altitude: number,
  size: number,
  spinAngle: number,
): Matrix4 {
  const translation = Matrix4.fromTranslation(new Cartesian3(0, 0, altitude), new Matrix4());
  const rotation = Matrix4.fromRotation(
    Matrix3.fromRotationZ(spinAngle, new Matrix3()),
    new Matrix4(),
  );
  const scale = Matrix4.fromScale(new Cartesian3(size, size, size), new Matrix4());
  const tr = Matrix4.multiply(translation, rotation, new Matrix4());
  const local = Matrix4.multiply(tr, scale, new Matrix4());
  return Matrix4.multiply(enuFrame, local, new Matrix4());
}

function buildTetherMatrix(enuFrame: Matrix4, radius: number, height: number): Matrix4 {
  return Matrix4.multiply(
    enuFrame,
    Matrix4.fromScale(new Cartesian3(radius, radius, Math.max(1, height))),
    new Matrix4(),
  );
}

function buildRingMatrix(enuFrame: Matrix4, radius: number): Matrix4 {
  return Matrix4.multiply(
    enuFrame,
    Matrix4.fromScale(new Cartesian3(radius, radius, 1)),
    new Matrix4(),
  );
}

/**
 * Adds a 3D holographic floating octahedron beacon with self-rotation, smooth bobbing,
 * a vertical energy tether, and a rotating ground lock-on ring.
 */
export function createHoloBeacon(viewer: Viewer, options: HoloBeaconOptions): HoloBeaconHandle {
  validateLngLat(options.position, 'position');

  const groundOffset = options.groundOffset ?? 0;
  const phase = options.phase ?? 0;
  const initialSize = options.size ?? 28_000;
  const hasExplicitRingRadius = options.ringRadius !== undefined;

  validateNonNegativeFinite(groundOffset, 'groundOffset');
  validatePositiveFinite(initialSize, 'size');
  if (!Number.isFinite(phase)) {
    throw new RangeError('Expected phase to be a finite number.');
  }

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    altitude: options.altitude ?? 120_000,
    size: initialSize,
    ringRadius: options.ringRadius ?? initialSize * 2.2,
    autoRingRadius: !hasExplicitRingRadius,
    spinSpeed: options.spinSpeed ?? 1,
    bobSpeed: options.bobSpeed ?? 1,
    bobAmplitude: options.bobAmplitude ?? 0.28,
    opacity: options.opacity ?? 0.9,
  };

  validatePositiveFinite(state.altitude, 'altitude');
  validatePositiveFinite(state.ringRadius, 'ringRadius');
  validateNonNegativeFinite(state.spinSpeed, 'spinSpeed');
  validateNonNegativeFinite(state.bobSpeed, 'bobSpeed');
  validateNonNegativeFinite(state.bobAmplitude, 'bobAmplitude');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const ground = sampleGroundHeight(viewer, options.position);
  const anchor = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    ground + groundOffset,
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, viewer.scene.ellipsoid);

  const crystalMaterial = new Material({
    fabric: {
      type: 'CesiumlabHoloBeaconCrystal',
      uniforms: {
        u_color: state.color,
        u_time: phase,
        u_opacity: state.opacity,
      },
      source: CRYSTAL_SHADER_SOURCE,
    },
    translucent: true,
  });

  const tetherMaterial = new Material({
    fabric: {
      type: 'CesiumlabHoloBeaconTether',
      uniforms: {
        u_color: state.color,
        u_time: phase,
        u_opacity: state.opacity,
      },
      source: TETHER_SHADER_SOURCE,
    },
    translucent: true,
  });

  const ringMaterial = new Material({
    fabric: {
      type: 'CesiumlabHoloBeaconRing',
      uniforms: {
        u_color: state.color,
        u_time: phase,
        u_opacity: state.opacity,
      },
      source: RING_SHADER_SOURCE,
    },
    translucent: true,
  });

  const createAlphaAppearance = (material: Material, flat = false) =>
    new MaterialAppearance({
      material,
      flat,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
        cull: { enabled: false },
      },
    });

  const computeFloatingAltitude = (elapsedSeconds: number) =>
    state.altitude +
    Math.sin(elapsedSeconds * state.bobSpeed * 2.2 + phase) * state.size * state.bobAmplitude;

  const crystalPrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createOctahedronGeometry(),
    }),
    appearance: createAlphaAppearance(crystalMaterial, false),
    modelMatrix: buildCrystalMatrix(enuFrame, computeFloatingAltitude(0), state.size, phase),
    asynchronous: false,
  });

  const tetherPrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createTetherGeometry(),
    }),
    appearance: createAlphaAppearance(tetherMaterial, false),
    modelMatrix: buildTetherMatrix(
      enuFrame,
      Math.max(120, state.size * 0.035),
      Math.max(1, computeFloatingAltitude(0) - state.size * 1.35),
    ),
    asynchronous: false,
  });

  const ringPrimitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createRingQuadGeometry(),
    }),
    appearance: createAlphaAppearance(ringMaterial, true),
    modelMatrix: buildRingMatrix(enuFrame, state.ringRadius),
    asynchronous: false,
  });

  const primitives = [crystalPrimitive, tetherPrimitive, ringPrimitive];
  for (const primitive of primitives) {
    viewer.scene.primitives.add(primitive);
  }

  let lastElapsed = 0;

  const syncFrame = (elapsedSeconds: number) => {
    lastElapsed = elapsedSeconds;
    const t = elapsedSeconds + phase;
    crystalMaterial.uniforms.u_time = t;
    tetherMaterial.uniforms.u_time = t;
    ringMaterial.uniforms.u_time = t;

    const currentAlt = computeFloatingAltitude(elapsedSeconds);
    const spinAngle = elapsedSeconds * state.spinSpeed * 1.15 + phase;
    crystalPrimitive.modelMatrix = buildCrystalMatrix(enuFrame, currentAlt, state.size, spinAngle);
    tetherPrimitive.modelMatrix = buildTetherMatrix(
      enuFrame,
      Math.max(120, state.size * 0.035),
      Math.max(1, currentAlt - state.size * 1.35),
    );
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, syncFrame);

  return createPrimitiveEffectHandle<HoloBeaconUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => primitives,
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
        crystalMaterial.uniforms.u_color = state.color;
        tetherMaterial.uniforms.u_color = state.color;
        ringMaterial.uniforms.u_color = state.color;
      }
      if (next.altitude !== undefined) {
        validatePositiveFinite(next.altitude, 'altitude');
        state.altitude = next.altitude;
      }
      if (next.size !== undefined) {
        validatePositiveFinite(next.size, 'size');
        state.size = next.size;
        if (state.autoRingRadius && next.ringRadius === undefined) {
          state.ringRadius = state.size * 2.2;
        }
      }
      if (next.ringRadius !== undefined) {
        validatePositiveFinite(next.ringRadius, 'ringRadius');
        state.ringRadius = next.ringRadius;
        state.autoRingRadius = false;
      }
      if (next.spinSpeed !== undefined) {
        validateNonNegativeFinite(next.spinSpeed, 'spinSpeed');
        state.spinSpeed = next.spinSpeed;
      }
      if (next.bobSpeed !== undefined) {
        validateNonNegativeFinite(next.bobSpeed, 'bobSpeed');
        state.bobSpeed = next.bobSpeed;
      }
      if (next.bobAmplitude !== undefined) {
        validateNonNegativeFinite(next.bobAmplitude, 'bobAmplitude');
        state.bobAmplitude = next.bobAmplitude;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        crystalMaterial.uniforms.u_opacity = state.opacity;
        tetherMaterial.uniforms.u_opacity = state.opacity;
        ringMaterial.uniforms.u_opacity = state.opacity;
      }
      ringPrimitive.modelMatrix = buildRingMatrix(enuFrame, state.ringRadius);
      syncFrame(lastElapsed);
    },
    onRestart() {
      syncFrame(0);
    },
  });
}
