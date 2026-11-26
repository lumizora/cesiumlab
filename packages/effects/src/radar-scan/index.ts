import {
  BlendingState,
  BoundingSphere,
  Cartesian3,
  CircleGeometry,
  ClassificationType,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GroundPrimitive,
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

export interface RadarScanOptions extends EffectBaseOptions {
  /** Center [longitude, latitude] in degrees. */
  position: LngLat;
  /** Radar sweep and ring color (Cesium Color or CSS string). Defaults to '#00e5a0'. */
  color?: ColorInput;
  /** Outer radar scan radius in metres. Defaults to 180_000. */
  radius?: number;
  /** Height offset above ground in metres. Defaults to 2_000. */
  height?: number;
  /** Rotation angular speed in radians per second. Defaults to 1.2. */
  speed?: number;
  /** Trailing luminous sector span in radians (0.1 to 2*PI). Defaults to Math.PI * 0.45. */
  sectorAngle?: number;
  /** Rotate clockwise when viewed from above. Defaults to true. */
  clockwise?: boolean;
  /** Overall opacity multiplier. Defaults to 0.9. */
  opacity?: number;
  /**
   * Drape the radar disc pixel-perfectly onto terrain and 3D Tiles via `GroundPrimitive`.
   * When `false`, renders a floating flat ENU disc at `height`. Defaults to `true`.
   */
  clampToGround?: boolean;
}

export type RadarScanUpdateOptions = Pick<
  RadarScanOptions,
  'color' | 'radius' | 'speed' | 'sectorAngle' | 'opacity' | 'clampToGround'
>;

export type RadarScanHandle = EffectHandle<RadarScanUpdateOptions>;

const DEFAULT_COLOR = Color.fromCssColorString('#00e5a0');

const RADAR_SCAN_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform float u_time;
uniform float u_speed;
uniform float u_sectorAngle;
uniform float u_direction;
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

  // Polar angle in [0, 2*PI)
  float theta = mod(atan(centered.y, centered.x) + TWO_PI, TWO_PI);
  float sweepAngle = mod(u_time * u_speed * u_direction, TWO_PI);

  // Angular distance behind the leading sweep edge in [0, 2*PI).
  float delta = u_direction < 0.0
    ? mod(theta - sweepAngle + TWO_PI, TWO_PI)
    : mod(sweepAngle - theta + TWO_PI, TWO_PI);

  // Screen-space pixel size in normalized radar coordinates for crisp zoom-adaptive line widths.
  float px = max(length(fwidth(centered)), 0.0004);

  // Uniform-width anti-aliased leading ray extending cleanly from the center (r = 0) to the outer edge.
  vec2 rayDir = vec2(cos(sweepAngle), sin(sweepAngle));
  float proj = dot(centered, rayDir);
  float perp = abs(centered.x * rayDir.y - centered.y * rayDir.x);
  float beamWidth = clamp(px * 1.4, 0.0022, 0.0065);
  float beam = exp(-pow(perp / beamWidth, 2.0)) * smoothstep(0.0, beamWidth * 0.8, proj);

  float sectorFrac = delta / max(0.05, u_sectorAngle);
  float sectorMask = smoothstep(0.0, 0.01, delta) * (1.0 - smoothstep(0.96, 1.0, sectorFrac));
  float sector = (sectorFrac <= 1.0)
    ? pow(1.0 - sectorFrac, 2.1) * 0.36 * sectorMask * smoothstep(0.0, 0.012, r)
    : 0.0;

  // Crisp concentric range rings and subtle crosshairs (keeping map imagery readable).
  float outerRing = exp(-pow((r - 0.985) / clamp(px * 1.8, 0.003, 0.009), 2.0)) * 0.48;
  float midRingA = exp(-pow((r - 0.66) / clamp(px * 1.2, 0.0022, 0.006), 2.0)) * 0.22;
  float midRingB = exp(-pow((r - 0.33) / clamp(px * 1.2, 0.0022, 0.006), 2.0)) * 0.22;
  float crossWidth = clamp(px * 1.0, 0.0018, 0.004);
  float crossX = exp(-pow(abs(centered.y) / crossWidth, 2.0)) * 0.14;
  float crossY = exp(-pow(abs(centered.x) / crossWidth, 2.0)) * 0.14;
  float dotRadius = clamp(px * 2.6, 0.006, 0.022);
  float centerDot = exp(-pow(r / dotRadius, 2.0)) * 0.42;

  float reticle = outerRing + midRingA + midRingB + (crossX + crossY) * smoothstep(1.0, 0.96, r) + centerDot;
  float outerClip = smoothstep(1.0, 0.965, r);
  float energy = (beam * 0.68 + sector + reticle) * outerClip;

  // Keep radar hue saturated; only apply a subtle highlight along the fine leading beam.
  vec3 tint = mix(u_color.rgb, vec3(1.0), clamp(beam * 0.28 + outerRing * 0.12, 0.0, 0.34));
  material.diffuse = tint;
  material.emission = tint * 0.35;
  material.alpha = clamp(energy * u_opacity, 0.0, 0.78);
  return material;
}
`;

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
 * Adds a GPU-driven rotating radar sweep sector on a single ENU disc Primitive,
 * complete with a sharp leading beam, fading afterglow sector, and concentric range rings.
 */
export function createRadarScan(viewer: Viewer, options: RadarScanOptions): RadarScanHandle {
  validateLngLat(options.position, 'position');

  const flatHeightOffset = options.height ?? 2_000;
  const clockwise = options.clockwise ?? true;
  validateNonNegativeFinite(flatHeightOffset, 'height');

  const state = {
    color: resolveColor(options.color, DEFAULT_COLOR),
    radius: options.radius ?? 180_000,
    speed: options.speed ?? 1.2,
    sectorAngle: options.sectorAngle ?? Math.PI * 0.45,
    opacity: options.opacity ?? 0.9,
    clampToGround: options.clampToGround ?? true,
  };

  validatePositiveFinite(state.radius, 'radius');
  validateNonNegativeFinite(state.speed, 'speed');
  validatePositiveFinite(state.sectorAngle, 'sectorAngle');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const ellipsoid = viewer.scene.ellipsoid;
  const centerCartesian = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    0,
    ellipsoid,
  );
  const ground = sampleGroundHeight(viewer, options.position);
  const anchor = Cartesian3.fromDegrees(
    options.position[0],
    options.position[1],
    ground + flatHeightOffset,
    ellipsoid,
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, ellipsoid);

  const material = new Material({
    fabric: {
      type: 'CesiumlabRadarScan',
      uniforms: {
        u_color: state.color,
        u_time: 0,
        u_speed: state.speed,
        u_sectorAngle: Math.min(Math.PI * 1.95, state.sectorAngle),
        u_direction: clockwise ? -1.0 : 1.0,
        u_opacity: state.opacity,
      },
      source: RADAR_SCAN_SHADER_SOURCE,
    },
    translucent: true,
  });

  const createFlatPrimitive = (radius: number): Primitive =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: createDiscQuadGeometry(),
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
      modelMatrix: buildDiscMatrix(enuFrame, radius),
      asynchronous: false,
    });

  const createGroundPrimitive = (radius: number): GroundPrimitive =>
    new GroundPrimitive({
      geometryInstances: new GeometryInstance({
        geometry: new CircleGeometry({
          center: centerCartesian,
          radius,
          ellipsoid,
        }),
      }),
      appearance: new MaterialAppearance({
        material,
        flat: true,
        translucent: true,
      }),
      classificationType: ClassificationType.BOTH,
      asynchronous: true,
    });

  let activeInGround = state.clampToGround;
  let primitive: Primitive | GroundPrimitive = activeInGround
    ? createGroundPrimitive(state.radius)
    : createFlatPrimitive(state.radius);

  const getActiveCollection = () =>
    activeInGround ? viewer.scene.groundPrimitives : viewer.scene.primitives;

  getActiveCollection().add(primitive);

  const swapPrimitive = (nextClamped: boolean, nextPrimitive: Primitive | GroundPrimitive) => {
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

  return createPrimitiveEffectHandle<RadarScanUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    getCollection: getActiveCollection,
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
      if (next.sectorAngle !== undefined) {
        validatePositiveFinite(next.sectorAngle, 'sectorAngle');
        state.sectorAngle = next.sectorAngle;
        material.uniforms.u_sectorAngle = Math.min(Math.PI * 1.95, state.sectorAngle);
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        material.uniforms.u_opacity = state.opacity;
      }

      const radiusChanged = next.radius !== undefined && next.radius !== state.radius;
      const clampChanged =
        next.clampToGround !== undefined && next.clampToGround !== state.clampToGround;

      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        state.radius = next.radius;
      }
      if (next.clampToGround !== undefined) {
        state.clampToGround = next.clampToGround;
      }

      if (clampChanged || (radiusChanged && state.clampToGround)) {
        swapPrimitive(
          state.clampToGround,
          state.clampToGround
            ? createGroundPrimitive(state.radius)
            : createFlatPrimitive(state.radius),
        );
      } else if (radiusChanged && !state.clampToGround && primitive instanceof Primitive) {
        primitive.modelMatrix = buildDiscMatrix(enuFrame, state.radius);
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });
}
