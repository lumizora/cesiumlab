import {
  BlendingState,
  Cartesian2,
  Cartesian3,
  ClassificationType,
  Color,
  EllipsoidGeodesic,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  GroundPrimitive,
  Material,
  MaterialAppearance,
  PolygonGeometry,
  PolygonHierarchy,
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
  sampleGroundHeight,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export interface WaterSurfaceOptions extends EffectBaseOptions {
  /** Ordered polygon vertices as [longitude, latitude] in degrees (minimum 3 points). */
  positions: readonly LngLat[];
  /** Deep water body color (Cesium Color or CSS string). Defaults to '#0a3a4a'. */
  color?: ColorInput;
  /** Sky reflection and solar glint highlight color. Defaults to '#dbeafe'. */
  specularColor?: ColorInput;
  /**
   * Water surface altitude above the ellipsoid in metres.
   * When omitted, automatically samples terrain elevation across the polygon so the water
   * can be placed directly on non-water land, valleys, or plateaus without sinking underground.
   */
  height?: number;
  /** Wave pattern scale multiplier (higher = denser finer ripples). Defaults to 1. */
  waveScale?: number;
  /** Wave normal perturbation amplitude (0 to 1.5). Defaults to 0.55. */
  amplitude?: number;
  /** In-place ripple shimmer speed multiplier (waves glisten without drifting when flowSpeed is 0). Defaults to 1. */
  speed?: number;
  /** Directional current flow speed multiplier (0 = still water shimmer only, > 0 = flowing river). Defaults to 0. */
  flowSpeed?: number;
  /** Primary directional current angle in radians (used when flowSpeed > 0). Defaults to 0.6. */
  flowAngle?: number;
  /** Specular sun glint intensity (0 to 2). Defaults to 0.9. */
  specularIntensity?: number;
  /** Base water opacity at steep viewing angles (0.1 to 1). Defaults to 0.72. */
  opacity?: number;
  /**
   * Conform the water polygon mesh directly to terrain relief (ideal for sloped rivers or mountain streams).
   * Defaults to `false` (flat horizontal water plane intersecting 3D terrain for lakes, reservoirs, and floods).
   */
  clampToGround?: boolean;
}

export type WaterSurfaceUpdateOptions = Pick<
  WaterSurfaceOptions,
  | 'color'
  | 'specularColor'
  | 'height'
  | 'waveScale'
  | 'amplitude'
  | 'speed'
  | 'flowSpeed'
  | 'flowAngle'
  | 'specularIntensity'
  | 'opacity'
  | 'clampToGround'
>;

export type WaterSurfaceHandle = EffectHandle<WaterSurfaceUpdateOptions>;

const DEFAULT_WATER_COLOR = Color.fromCssColorString('#0a3a4a');
const DEFAULT_SPECULAR_COLOR = Color.fromCssColorString('#dbeafe');

const WATER_SURFACE_SHADER_SOURCE = /* glsl */ `
uniform vec4 u_color;
uniform vec4 u_specularColor;
uniform vec2 u_meterSpan;
uniform float u_time;
uniform float u_waveScale;
uniform float u_amplitude;
uniform float u_speed;
uniform float u_flowSpeed;
uniform float u_flowAngle;
uniform float u_specularIntensity;
uniform float u_opacity;

const mat2 OCTAVE_ROT = mat2(0.80, 0.60, -0.60, 0.80);
const mat2 OCTAVE_ROT_T = mat2(0.80, -0.60, 0.60, 0.80);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Smooth non-periodic value noise with analytical gradient (dx, dy) in a single pass.
// Eliminates 4-tap finite-difference overhead so D3D11/ANGLE compiles GroundPrimitive shaders instantly.
vec2 valueNoiseGrad(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic C2-continuous Hermite curve eliminates grid-boundary specular creases at high amplitude
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;
  return du * vec2(k1 + k3 * u.y, k2 + k3 * u.x);
}

// 3-octave rotated analytical FBM slope producing organic wind-driven water swells.
vec2 waterFbmSlope(vec2 p) {
  vec2 grad = vec2(0.0);
  float amp = 0.56;
  mat2 rotT = mat2(1.0);
  for (int i = 0; i < 3; i++) {
    grad += amp * (rotT * valueNoiseGrad(p));
    p = OCTAVE_ROT * p * 2.07 + vec2(13.1, 7.7);
    rotT = rotT * OCTAVE_ROT_T;
    amp *= 0.62;
  }
  return grad;
}

// Symmetrical counter-propagating analytical wave slopes (zero net drift when flowSpeed == 0).
vec2 sampleWaveSlope(vec2 worldMeters, float wavelength, float rippleT, float flowT, vec2 flowDir) {
  vec2 uv = worldMeters / max(1.0, wavelength);
  vec2 currentShift = flowDir * (flowT * 0.48);

  vec2 gA = waterFbmSlope(uv - currentShift + flowDir * (rippleT * 0.28));
  vec2 gB = waterFbmSlope(uv * 1.42 - currentShift - flowDir * (rippleT * 0.31) + vec2(4.3, -2.9));
  return (gA * 0.54 + gB * 0.46) * 0.72;
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 worldMeters = materialInput.st * u_meterSpan;
  float rippleT = u_time * u_speed;
  float flowT = u_time * u_flowSpeed;
  vec2 flowDir = vec2(cos(u_flowAngle), sin(u_flowAngle));

  // Camera-distance-adaptive multi-scale LOD so ripples look physically plausible from 200m to 80km.
  float camDist = max(80.0, length(materialInput.positionToEyeEC));
  float logDist = log2(camDist / 260.0);
  float lodFloor = floor(logDist);
  float lodFrac = fract(logDist);

  float baseWave = 14.0 / max(0.15, u_waveScale);
  float waveCoarse = baseWave * pow(2.0, clamp(lodFloor + 1.0, 0.0, 6.5));
  float waveFine = baseWave * pow(2.0, clamp(lodFloor, 0.0, 5.5));

  vec2 slopeFine = sampleWaveSlope(worldMeters, waveFine, rippleT, flowT, flowDir);
  vec2 slopeCoarse = sampleWaveSlope(worldMeters, waveCoarse, rippleT * 0.72, flowT * 0.72, flowDir);
  vec2 slope = mix(slopeFine, slopeCoarse, smoothstep(0.15, 0.85, lodFrac)) * u_amplitude;

  // Build an analytical C-infinity ellipsoid ENU frame from eye coordinates
  // so GroundPrimitive avoids depth-buffer neighbor normal spikes along terrain tile seams.
  vec3 posWC = (czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0)).xyz;
  vec3 upWC = normalize(posWC);
  vec3 eastWC = normalize(cross(vec3(0.0, 0.0, 1.0), upWC));
  vec3 northWC = cross(upWC, eastWC);
  mat3 enuToEC = mat3(
    czm_viewRotation * eastWC,
    czm_viewRotation * northWC,
    czm_viewRotation * upWC
  );

  vec3 localNormal = normalize(vec3(-slope.x, -slope.y, 1.0));
  vec3 normalEC = normalize(enuToEC * localNormal);
  vec3 upEC = normalize(enuToEC[2]);
  vec3 viewDir = normalize(materialInput.positionToEyeEC);

  // Schlick Fresnel reflection: transparent at steep angles, mirror-like sky reflection at grazing angles.
  float ndotv = clamp(dot(normalEC, viewDir), 0.0, 1.0);
  float fresnel = 0.035 + 0.965 * pow(1.0 - ndotv, 4.2);

  // Procedural atmospheric sky gradient sampled along the perturbed reflection vector.
  vec3 reflDir = reflect(-viewDir, normalEC);
  float reflElev = clamp(dot(reflDir, upEC), 0.0, 1.0);
  vec3 horizonSky = mix(u_specularColor.rgb, vec3(0.84, 0.90, 0.95), 0.45);
  vec3 zenithSky = mix(u_color.rgb * 0.65, vec3(0.09, 0.24, 0.42), 0.65);
  vec3 skyReflect = mix(horizonSky, zenithSky, pow(reflElev, 0.62));

  // Subtle subsurface scattering on sun-facing wave facets (never flat painted blotches).
  vec3 sunDir = normalize(czm_sunDirectionEC);
  float sunAlign = clamp(dot(normalEC, sunDir), 0.0, 1.0);
  vec3 deepWater = u_color.rgb * 0.55;
  vec3 scatterWater = mix(u_color.rgb * 0.92, vec3(0.08, 0.48, 0.56), 0.28);
  vec3 waterBody = mix(deepWater, scatterWater, 0.25 + 0.55 * sunAlign);

  // Crisp dual-lobe solar glint (sparkling micro-facets + broader sun sheen).
  vec3 halfVec = normalize(sunDir + viewDir);
  float ndoth = max(dot(normalEC, halfVec), 0.0);
  float glintSharp = pow(ndoth, 220.0) * 1.45;
  float glintSoft = pow(ndoth, 26.0) * 0.16;
  float specular = (glintSharp + glintSoft) * u_specularIntensity;

  vec3 finalColor = mix(waterBody, skyReflect, clamp(fresnel * 0.85, 0.0, 0.88));
  finalColor += u_specularColor.rgb * specular;

  material.diffuse = vec3(0.0);
  material.emission = finalColor;
  material.alpha = clamp(u_opacity + fresnel * 0.24 + glintSharp * 0.3, 0.0, 0.96);
  return material;
}
`;

function computePolygonMeterSpan(
  points: readonly LngLat[],
  ellipsoid: Viewer['scene']['ellipsoid'],
): Cartesian2 {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const midLat = (minLat + maxLat) * 0.5;
  const midLng = (minLng + maxLng) * 0.5;
  const west = validateLngLat([minLng, midLat], 'bounds.west');
  const east = validateLngLat([maxLng, midLat], 'bounds.east');
  const south = validateLngLat([midLng, minLat], 'bounds.south');
  const north = validateLngLat([midLng, maxLat], 'bounds.north');

  const spanEast = Math.max(50, new EllipsoidGeodesic(west, east, ellipsoid).surfaceDistance);
  const spanNorth = Math.max(50, new EllipsoidGeodesic(south, north, ellipsoid).surfaceDistance);
  return new Cartesian2(spanEast, spanNorth);
}

function resolveAutoWaterHeight(viewer: Viewer, points: readonly LngLat[]): number {
  let sumLng = 0;
  let sumLat = 0;
  let maxGround = -Infinity;

  for (const pt of points) {
    sumLng += pt[0];
    sumLat += pt[1];
    const h = sampleGroundHeight(viewer, pt);
    if (h > maxGround) maxGround = h;
  }

  const centerH = sampleGroundHeight(viewer, [sumLng / points.length, sumLat / points.length]);
  const base = Number.isFinite(maxGround) ? Math.max(centerH, maxGround) : centerH;
  // Lift slightly above sampled ground to avoid Z-fighting on flat non-water terrain.
  return base + 4;
}

function buildWaterPrimitive(
  positions: readonly Cartesian3[],
  height: number,
  ellipsoid: Viewer['scene']['ellipsoid'],
  material: Material,
): Primitive {
  return new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy([...positions]),
        height,
        ellipsoid,
        vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance: new EllipsoidSurfaceAppearance({
      material,
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
}

/**
 * Adds a GPU-driven procedural flowing water surface over any geographic polygon
 * (water bodies or non-water land/valleys) with distance-adaptive FBM wave normals,
 * atmospheric Fresnel sky reflections, and dual-lobe solar glint.
 */
export function createWaterSurface(
  viewer: Viewer,
  options: WaterSurfaceOptions,
): WaterSurfaceHandle {
  if (!Array.isArray(options.positions) || options.positions.length < 3) {
    throw new RangeError('Expected positions to contain at least 3 [longitude, latitude] points.');
  }

  const ellipsoid = viewer.scene.ellipsoid;
  const cartesianPositions: Cartesian3[] = [];
  for (let i = 0; i < options.positions.length; i += 1) {
    const [lng, lat] = options.positions[i]!;
    validateLngLat([lng, lat], `positions[${i}]`);
    cartesianPositions.push(Cartesian3.fromDegrees(lng, lat, 0, ellipsoid));
  }

  const meterSpan = computePolygonMeterSpan(options.positions, ellipsoid);
  const resolvedHeight =
    options.height !== undefined
      ? options.height
      : resolveAutoWaterHeight(viewer, options.positions);

  const state = {
    color: resolveColor(options.color, DEFAULT_WATER_COLOR),
    specularColor: resolveColor(options.specularColor, DEFAULT_SPECULAR_COLOR),
    height: resolvedHeight,
    waveScale: options.waveScale ?? 1,
    amplitude: options.amplitude ?? 0.55,
    speed: options.speed ?? 1,
    flowSpeed: options.flowSpeed ?? 0,
    flowAngle: options.flowAngle ?? 0.6,
    specularIntensity: options.specularIntensity ?? 0.9,
    opacity: options.opacity ?? 0.72,
    clampToGround: options.clampToGround ?? false,
  };

  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }
  validatePositiveFinite(state.waveScale, 'waveScale');
  validateNonNegativeFinite(state.amplitude, 'amplitude');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.flowSpeed, 'flowSpeed');
  if (!Number.isFinite(state.flowAngle)) {
    throw new RangeError('Expected flowAngle to be a finite number.');
  }
  validateNonNegativeFinite(state.specularIntensity, 'specularIntensity');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const material = new Material({
    fabric: {
      type: 'CesiumlabWaterSurface',
      uniforms: {
        u_color: state.color,
        u_specularColor: state.specularColor,
        u_meterSpan: meterSpan,
        u_time: 0,
        u_waveScale: state.waveScale,
        u_amplitude: state.amplitude,
        u_speed: state.speed,
        u_flowSpeed: state.flowSpeed,
        u_flowAngle: state.flowAngle,
        u_specularIntensity: state.specularIntensity,
        u_opacity: state.opacity,
      },
      source: WATER_SURFACE_SHADER_SOURCE,
    },
    translucent: true,
  });

  const buildGroundWaterPrimitive = (): GroundPrimitive =>
    new GroundPrimitive({
      geometryInstances: new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy([...cartesianPositions]),
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
    ? buildGroundWaterPrimitive()
    : buildWaterPrimitive(cartesianPositions, state.height, ellipsoid, material);

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

  return createPrimitiveEffectHandle<WaterSurfaceUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    getCollection: getActiveCollection,
    onUpdate(next) {
      if (next.color !== undefined) {
        state.color = resolveColor(next.color, DEFAULT_WATER_COLOR);
        material.uniforms.u_color = state.color;
      }
      if (next.specularColor !== undefined) {
        state.specularColor = resolveColor(next.specularColor, DEFAULT_SPECULAR_COLOR);
        material.uniforms.u_specularColor = state.specularColor;
      }
      if (next.waveScale !== undefined) {
        validatePositiveFinite(next.waveScale, 'waveScale');
        state.waveScale = next.waveScale;
        material.uniforms.u_waveScale = state.waveScale;
      }
      if (next.amplitude !== undefined) {
        validateNonNegativeFinite(next.amplitude, 'amplitude');
        state.amplitude = next.amplitude;
        material.uniforms.u_amplitude = state.amplitude;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
      if (next.flowSpeed !== undefined) {
        validateNonNegativeFinite(next.flowSpeed, 'flowSpeed');
        state.flowSpeed = next.flowSpeed;
        material.uniforms.u_flowSpeed = state.flowSpeed;
      }
      if (next.flowAngle !== undefined) {
        if (!Number.isFinite(next.flowAngle)) {
          throw new RangeError('Expected flowAngle to be a finite number.');
        }
        state.flowAngle = next.flowAngle;
        material.uniforms.u_flowAngle = state.flowAngle;
      }
      if (next.specularIntensity !== undefined) {
        validateNonNegativeFinite(next.specularIntensity, 'specularIntensity');
        state.specularIntensity = next.specularIntensity;
        material.uniforms.u_specularIntensity = state.specularIntensity;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = Math.min(1, next.opacity);
        material.uniforms.u_opacity = state.opacity;
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
          state.clampToGround
            ? buildGroundWaterPrimitive()
            : buildWaterPrimitive(cartesianPositions, state.height, ellipsoid, material),
        );
      } else if (heightChanged && !state.clampToGround) {
        swapPrimitive(
          false,
          buildWaterPrimitive(cartesianPositions, state.height, ellipsoid, material),
        );
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });
}
