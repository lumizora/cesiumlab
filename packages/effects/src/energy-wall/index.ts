import {
  BlendingState,
  BoundingSphere,
  Cartesian3,
  Color,
  ComponentDatatype,
  EllipsoidGeodesic,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Material,
  MaterialAppearance,
  Primitive,
  PrimitiveType,
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

export interface EnergyWallOptions extends EffectBaseOptions {
  /** Ordered polygon or polyline vertices as [longitude, latitude] in degrees (minimum 2 points). */
  positions: readonly LngLat[];
  /** Wall glow color (Cesium Color or CSS string). Defaults to '#00d4ff'. */
  color?: ColorInput;
  /** Vertical wall height in metres. Defaults to 30_000. */
  height?: number;
  /** Base altitude above ellipsoid in metres. Defaults to 0. */
  baseHeight?: number;
  /** Close the loop from the last point back to the first when >= 3 points are provided. Defaults to true. */
  closed?: boolean;
  /** Upward energy wave speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall wall opacity multiplier (0 to 1.5). Defaults to 0.85. */
  opacity?: number;
  /** Number of vertical energy wave bands. Defaults to 3. */
  repeat?: number;
}

export type EnergyWallUpdateOptions = Pick<
  EnergyWallOptions,
  'color' | 'height' | 'speed' | 'opacity' | 'repeat'
>;

export type EnergyWallHandle = EffectHandle<EnergyWallUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#00d4ff');

const ENERGY_WALL_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_speed;
uniform float u_opacity;
uniform float u_repeat;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Fine, crisp glowing footprint line along the bottom edge without obscuring the terrain.
  float baseLine = exp(-pow(st.t / 0.018, 2.0));

  // Smooth exponential vertical attenuation vanishing cleanly at the top edge.
  float bodyFade = pow(clamp(1.0 - st.t, 0.0, 1.0), 1.65) * smoothstep(1.0, 0.86, st.t);

  // Upward flowing energy bands.
  float phase = st.t * u_repeat - u_time * u_speed * 0.75;
  float waveA = pow(0.5 + 0.5 * sin(phase * 6.2831853), 3.0);
  float waveB = pow(0.5 + 0.5 * sin((phase * 2.1 + 1.3) * 6.2831853), 4.0) * 0.4;

  // Subtle vertical digital scanlines along the perimeter.
  float columns = 0.84 + 0.16 * sin(st.s * 6.2831853 * 24.0);

  float bodyAlpha = bodyFade * (0.16 + 0.34 * (waveA + waveB)) * columns;
  float alpha = clamp((bodyAlpha + baseLine * 0.58) * u_opacity, 0.0, 0.76);

  // Keep hue saturated; only add a delicate highlight on the thin base rim and wave crests.
  float highlight = clamp(baseLine * 0.28 + waveA * bodyFade * 0.16, 0.0, 0.38);
  vec3 tint = mix(u_color.rgb, vec3(1.0), highlight);

  material.diffuse = tint;
  material.emission = tint * 0.35;
  material.alpha = alpha;
  return material;
}
`;

function buildWallGeometry(
  points: readonly LngLat[],
  baseHeight: number,
  height: number,
  closed: boolean,
  ellipsoid: Viewer['scene']['ellipsoid'],
): Geometry {
  const ring: LngLat[] = [...points];
  if (closed && ring.length >= 3) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(first);
    }
  }

  // Compute cumulative surface distance for uniform horizontal UVs.
  const distances: number[] = [0];
  let totalDistance = 0;
  for (let i = 1; i < ring.length; i += 1) {
    const a = validateLngLat(ring[i - 1]!, `positions[${i - 1}]`);
    const b = validateLngLat(ring[i]!, `positions[${i}]`);
    const segmentDistance = new EllipsoidGeodesic(a, b, ellipsoid).surfaceDistance;
    totalDistance += segmentDistance;
    distances.push(totalDistance);
  }
  const safeTotal = Math.max(1, totalDistance);

  const count = ring.length;
  const vertexCount = count * 2;
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array((count - 1) * 6);

  const cartPositions: Cartesian3[] = [];

  for (let i = 0; i < count; i += 1) {
    const [lng, lat] = ring[i]!;
    const bottom = Cartesian3.fromDegrees(lng, lat, baseHeight, ellipsoid);
    const top = Cartesian3.fromDegrees(lng, lat, baseHeight + height, ellipsoid);
    cartPositions.push(bottom, top);

    const normal = Cartesian3.normalize(bottom, new Cartesian3());
    const u = distances[i]! / safeTotal;

    const bIdx = i * 2;
    positions[bIdx * 3] = bottom.x;
    positions[bIdx * 3 + 1] = bottom.y;
    positions[bIdx * 3 + 2] = bottom.z;
    normals[bIdx * 3] = normal.x;
    normals[bIdx * 3 + 1] = normal.y;
    normals[bIdx * 3 + 2] = normal.z;
    sts[bIdx * 2] = u;
    sts[bIdx * 2 + 1] = 0;

    const tIdx = bIdx + 1;
    positions[tIdx * 3] = top.x;
    positions[tIdx * 3 + 1] = top.y;
    positions[tIdx * 3 + 2] = top.z;
    normals[tIdx * 3] = normal.x;
    normals[tIdx * 3 + 1] = normal.y;
    normals[tIdx * 3 + 2] = normal.z;
    sts[tIdx * 2] = u;
    sts[tIdx * 2 + 1] = 1;
  }

  for (let i = 0; i < count - 1; i += 1) {
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
    boundingSphere: BoundingSphere.fromPoints(cartPositions),
  });
}

/**
 * Adds a GPU-driven luminous vertical energy fence along any polygon or polyline path.
 */
export function createEnergyWall(viewer: Viewer, options: EnergyWallOptions): EnergyWallHandle {
  if (!Array.isArray(options.positions) || options.positions.length < 2) {
    throw new RangeError('Expected positions to contain at least 2 [longitude, latitude] points.');
  }
  for (let i = 0; i < options.positions.length; i += 1) {
    validateLngLat(options.positions[i]!, `positions[${i}]`);
  }

  const baseHeight = options.baseHeight ?? 0;
  const closed = options.closed ?? options.positions.length >= 3;
  validateNonNegativeFinite(baseHeight, 'baseHeight');

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    height: options.height ?? 30_000,
    speed: options.speed ?? 1,
    opacity: options.opacity ?? 0.85,
    repeat: options.repeat ?? 3,
  };

  validatePositiveFinite(state.height, 'height');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.opacity, 'opacity');
  validatePositiveFinite(state.repeat, 'repeat');

  const material = new Material({
    fabric: {
      type: 'CesiumlabEnergyWall',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_speed: state.speed,
        u_opacity: state.opacity,
        u_repeat: state.repeat,
      },
      source: ENERGY_WALL_SHADER_SOURCE,
    },
    translucent: true,
  });

  const createWallPrimitive = (height: number): Primitive =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: buildWallGeometry(
          options.positions,
          baseHeight,
          height,
          closed,
          viewer.scene.ellipsoid,
        ),
      }),
      appearance: new MaterialAppearance({
        material,
        flat: true,
        translucent: true,
        closed: false,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          blending: BlendingState.ALPHA_BLEND,
          cull: { enabled: false },
        },
      }),
      asynchronous: false,
    });

  let primitive = createWallPrimitive(state.height);
  viewer.scene.primitives.add(primitive);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  return createPrimitiveEffectHandle<EnergyWallUpdateOptions>({
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
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        material.uniforms.u_opacity = state.opacity;
      }
      if (next.repeat !== undefined) {
        validatePositiveFinite(next.repeat, 'repeat');
        state.repeat = next.repeat;
        material.uniforms.u_repeat = state.repeat;
      }
      if (next.height !== undefined && next.height !== state.height) {
        validatePositiveFinite(next.height, 'height');
        state.height = next.height;
        if (!viewer.isDestroyed()) {
          viewer.scene.primitives.remove(primitive);
          primitive = createWallPrimitive(state.height);
          viewer.scene.primitives.add(primitive);
        }
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });
}
