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

export interface HoloDomeOptions extends EffectBaseOptions {
  /** Center [longitude, latitude] in degrees. */
  position: LngLat;
  /** Dome shield color (Cesium Color or CSS string). Defaults to '#38bdf8'. */
  color?: ColorInput;
  /** Equatorial radius of the dome in metres. Defaults to 180_000. */
  radius?: number;
  /** Vertical dome height multiplier relative to radius (e.g. 0.85 for a slightly flattened shield). Defaults to 0.85. */
  heightScale?: number;
  /** Rising holographic scan speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall opacity multiplier. Defaults to 0.85. */
  opacity?: number;
  /** Procedural honeycomb grid density. Defaults to 14. */
  gridScale?: number;
  /** Ground altitude offset in metres. Defaults to 0. */
  groundOffset?: number;
}

export type HoloDomeUpdateOptions = Pick<
  HoloDomeOptions,
  'color' | 'radius' | 'heightScale' | 'speed' | 'opacity' | 'gridScale'
>;

export type HoloDomeHandle = EffectHandle<HoloDomeUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#38bdf8');

const HOLO_DOME_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_speed;
uniform float u_opacity;
uniform float u_gridScale;

// Procedural hexagonal grid distance (0 at hex border, 0.5 at hex center).
float hexEdge(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 av = abs(gv);
  float dist = max(dot(av, normalize(r)), av.x);
  return smoothstep(0.42, 0.49, dist);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  // Fresnel rim glow: translucent in the center, luminous along the silhouette.
  float ndotv = abs(dot(normalize(materialInput.normalEC), normalize(materialInput.positionToEyeEC)));
  float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), 2.1);

  // Fine glowing equatorial ring where the dome meets the ground.
  float baseRim = exp(-pow(st.t / 0.022, 2.0));

  // Rising latitude scan wave from base (0) to apex (1).
  float scanPos = fract(u_time * u_speed * 0.35);
  float scanDist = abs(st.t - scanPos);
  float scanBand = exp(-pow(scanDist / 0.045, 2.0)) * smoothstep(1.0, 0.85, st.t);

  // Procedural hexagonal energy mesh, highlighted when the scan band passes through.
  vec2 gridUv = vec2(st.s * u_gridScale * 2.2, st.t * u_gridScale);
  float hex = hexEdge(gridUv) * smoothstep(0.98, 0.72, st.t);

  float shell = fresnel * 0.52 + hex * (0.14 + 0.45 * scanBand + 0.22 * fresnel) + scanBand * 0.28 + baseRim * 0.55;
  float highlight = clamp(baseRim * 0.26 + scanBand * 0.24 + fresnel * 0.16, 0.0, 0.36);
  vec3 tint = mix(u_color.rgb, vec3(1.0), highlight);

  material.diffuse = vec3(0.0);
  material.emission = tint;
  material.alpha = clamp(shell * u_opacity, 0.0, 0.76);
  return material;
}
`;

/** Builds an open-bottom unit hemisphere shell in local ENU space (z in [0, 1]). */
function createHemisphereGeometry(stacks = 28, slices = 64): Geometry {
  const vertexCount = (stacks + 1) * (slices + 1);
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(stacks * slices * 6);

  let vIdx = 0;
  for (let stack = 0; stack <= stacks; stack += 1) {
    const v = stack / stacks;
    const phi = v * (Math.PI * 0.5);
    // Exact trigonometric endpoints prevent floating-point antimeridian crossings in Cesium's splitLongitude.
    const cosPhi = stack === stacks ? 0 : Math.cos(phi);
    const sinPhi = stack === stacks ? 1 : Math.sin(phi);

    for (let slice = 0; slice <= slices; slice += 1) {
      const u = slice / slices;
      const theta = u * Math.PI * 2;
      const isZeroSeam = slice === 0 || slice === slices;
      const isPiSeam = slice * 2 === slices;
      const cosTheta = isZeroSeam ? 1 : isPiSeam ? -1 : Math.cos(theta);
      const sinTheta = isZeroSeam || isPiSeam ? 0 : Math.sin(theta);
      const x = cosPhi * cosTheta;
      const y = cosPhi * sinTheta;
      const z = sinPhi;

      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;
      normals[vIdx * 3] = x;
      normals[vIdx * 3 + 1] = y;
      normals[vIdx * 3 + 2] = z;
      sts[vIdx * 2] = u;
      sts[vIdx * 2 + 1] = v;
      vIdx += 1;
    }
  }

  let iIdx = 0;
  const stride = slices + 1;
  for (let stack = 0; stack < stacks; stack += 1) {
    for (let slice = 0; slice < slices; slice += 1) {
      const a = stack * stride + slice;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;

      indices[iIdx] = a;
      indices[iIdx + 1] = b;
      indices[iIdx + 2] = d;
      indices[iIdx + 3] = a;
      indices[iIdx + 4] = d;
      indices[iIdx + 5] = c;
      iIdx += 6;
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
    boundingSphere: new BoundingSphere(new Cartesian3(0, 0, 0.5), Math.SQRT2),
  });
}

function buildDomeMatrix(enuFrame: Matrix4, radius: number, heightScale: number): Matrix4 {
  return Matrix4.multiply(
    enuFrame,
    Matrix4.fromScale(new Cartesian3(radius, radius, radius * heightScale)),
    new Matrix4(),
  );
}

/**
 * Adds a 3D volumetric holographic dome shield with Fresnel rim glow,
 * procedural hexagonal honeycomb mesh, and a rising latitude scan wave.
 */
export function createHoloDome(viewer: Viewer, options: HoloDomeOptions): HoloDomeHandle {
  validateLngLat(options.position, 'position');

  const groundOffset = options.groundOffset ?? 0;
  validateNonNegativeFinite(groundOffset, 'groundOffset');

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    radius: options.radius ?? 180_000,
    heightScale: options.heightScale ?? 0.85,
    speed: options.speed ?? 1,
    opacity: options.opacity ?? 0.85,
    gridScale: options.gridScale ?? 14,
  };

  validatePositiveFinite(state.radius, 'radius');
  validatePositiveFinite(state.heightScale, 'heightScale');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.opacity, 'opacity');
  validatePositiveFinite(state.gridScale, 'gridScale');

  const ground = sampleGroundHeight(viewer, options.position);
  const anchor = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    ground + groundOffset,
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, viewer.scene.ellipsoid);

  const material = new Material({
    fabric: {
      type: 'CesiumlabHoloDome',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_speed: state.speed,
        u_opacity: state.opacity,
        u_gridScale: state.gridScale,
      },
      source: HOLO_DOME_SHADER_SOURCE,
    },
    translucent: true,
  });

  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: createHemisphereGeometry(),
    }),
    appearance: new MaterialAppearance({
      material,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
        cull: { enabled: false },
      },
    }),
    modelMatrix: buildDomeMatrix(enuFrame, state.radius, state.heightScale),
    asynchronous: false,
  });

  viewer.scene.primitives.add(primitive);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  return createPrimitiveEffectHandle<HoloDomeUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_COLOR);
        material.uniforms.u_color = state.color;
      }
      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        state.radius = next.radius;
      }
      if (next.heightScale !== undefined) {
        validatePositiveFinite(next.heightScale, 'heightScale');
        state.heightScale = next.heightScale;
      }
      if (next.radius !== undefined || next.heightScale !== undefined) {
        primitive.modelMatrix = buildDomeMatrix(enuFrame, state.radius, state.heightScale);
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
      if (next.gridScale !== undefined) {
        validatePositiveFinite(next.gridScale, 'gridScale');
        state.gridScale = next.gridScale;
        material.uniforms.u_gridScale = state.gridScale;
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });
}
