import {
  BlendingState,
  BoundingSphere,
  Cartesian3,
  ClassificationType,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GroundInstancedDecalPrimitive,
  Material,
  MaterialAppearance,
  Math as CesiumMath,
  Primitive,
  PrimitiveType,
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

export type PulseScatterStyle = 'pulse' | 'breath' | 'ripple';

export interface PulseScatterPoint {
  /** Geographic longitude & latitude `[lng, lat]` in degrees. */
  position: LngLat;
  /** Optional per-point disc radius in metres. Falls back to `options.radius`. */
  radius?: number;
  /** Optional per-point color (CSS string or Cesium `Color`). Falls back to `options.color`. */
  color?: ColorInput;
  /** Optional per-point animation phase offset in `[0, 1)`. Auto-hashed deterministically when omitted. */
  phase?: number;
  /** Optional per-point altitude above the ellipsoid in metres. Falls back to `options.height`. */
  height?: number;
}

export interface PulseScatterOptions extends EffectBaseOptions {
  /** Array of scatter points to batch into a single GPU draw call (supports 10,000–50,000+ points at 60fps). */
  points: readonly PulseScatterPoint[];
  /** Animation style (`'pulse' | 'breath' | 'ripple'`). Defaults to `'pulse'`. */
  style?: PulseScatterStyle;
  /** Default disc radius in metres for points without an explicit `radius`. Defaults to 400. */
  radius?: number;
  /** Global multiplier applied to every point's radius. Defaults to 1. */
  sizeScale?: number;
  /** Default color for points without an explicit `color`. Defaults to `'#00e5ff'`. */
  color?: ColorInput;
  /** Animation speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall opacity multiplier (0 to 1). Defaults to 0.92. */
  opacity?: number;
  /** Core & halo luminance intensity multiplier (0.2 to 2.5). Defaults to 1.15. */
  glow?: number;
  /** Default altitude above the ellipsoid in metres when `clampToGround` is `false`. Defaults to 20. */
  height?: number;
  /**
   * Drape all scatter points pixel-perfectly onto terrain and 3D Tiles via `GroundInstancedDecalPrimitive`
   * (single hardware-instanced deferred decal draw call, zero stencil overlap artifacts). Defaults to `true`.
   */
  clampToGround?: boolean;
  /** Classification target when `clampToGround` is `true`. Defaults to `ClassificationType.BOTH`. */
  classificationType?: ClassificationType;
}

export type PulseScatterUpdateOptions = Partial<
  Pick<
    PulseScatterOptions,
    | 'points'
    | 'style'
    | 'radius'
    | 'sizeScale'
    | 'color'
    | 'speed'
    | 'opacity'
    | 'glow'
    | 'height'
    | 'clampToGround'
  >
>;

export type PulseScatterHandle = EffectHandle<PulseScatterUpdateOptions>;

const STYLE_INDEX: Record<PulseScatterStyle, number> = {
  pulse: 0,
  breath: 1,
  ripple: 2,
};

const SCATTER_VERTEX_SHADER = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec2 st;
in vec4 color;
in float batchId;

out vec2 v_st;
out vec4 v_color;

void main() {
  vec4 p = czm_computePosition();
  v_st = st;
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

const SCATTER_FRAGMENT_SHADER = /* glsl */ `
in vec2 v_st;
in vec4 v_color;

void main() {
  czm_materialInput materialInput;
  materialInput.st = v_st;
  materialInput.str = vec3(v_color.a, 0.0, 0.0);
  czm_material material = czm_getMaterial(materialInput);
  if (material.alpha <= 0.004) {
    discard;
  }
  vec3 baseRgb = v_color.rgb;
  vec3 hotRgb = mix(baseRgb, vec3(1.0), 0.72);
  vec3 finalRgb = baseRgb * material.emission.g + hotRgb * material.emission.r;
  out_FragColor = vec4(finalRgb, material.alpha);
}
`;

const SCATTER_MATERIAL_SHADER = /* glsl */ `
uniform float u_time;
uniform float u_style;
uniform float u_speed;
uniform float u_opacity;
uniform float u_glow;

float ringWave(float r, float phase, float width) {
  float waveR = mix(0.14, 0.96, phase);
  float dist = waveR - r;
  // Crisp leading edge + smooth inward wake
  float leading = smoothstep(-width * 0.55, 0.0, dist);
  float wake = exp(-max(dist, 0.0) * 9.5) * step(0.0, dist);
  float band = smoothstep(width, 0.0, abs(r - waveR));
  float fade = (1.0 - phase) * (1.0 - phase) * smoothstep(0.0, 0.1, phase);
  return max(band * 0.95, leading * wake * 0.55) * fade;
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 p = materialInput.st * 2.0 - 1.0;
  float r = length(p);
  if (r >= 1.0) {
    material.alpha = 0.0;
    return material;
  }

  float seed = materialInput.str.x;
  float t = u_time * u_speed;

  float coreHot = 0.0;
  float haloColor = 0.0;
  float alpha = 0.0;

  if (u_style < 0.5) {
    // 0: Pulse — luminous core + sweeping shockwave ring
    float phase = fract(t * 0.55 + seed);
    float corePulse = 0.88 + 0.12 * sin(t * 3.5 + seed * 6.2831853);
    float core = smoothstep(0.28, 0.06, r) * corePulse;
    float aura = exp(-r * 3.6) * 0.48;
    float ring = ringWave(r, phase, 0.075);

    coreHot = core * 0.95 + ring * 0.32;
    haloColor = aura + ring * 1.15 + core * 0.35;
    alpha = clamp(core * 0.95 + aura * 0.65 + ring * 0.9, 0.0, 1.0);
  } else if (u_style < 1.5) {
    // 1: Breath — smooth sinusoidal breathing starry matrix
    float b = 0.5 + 0.5 * sin(t * 2.6 + seed * 6.2831853);
    float coreR = mix(0.2, 0.38, b);
    float core = smoothstep(coreR, 0.03, r);
    float aura = exp(-r * r * mix(6.2, 2.7, b)) * mix(0.45, 0.95, b);
    float rim = smoothstep(0.1, 0.0, abs(r - mix(0.32, 0.62, b))) * 0.25 * b;

    coreHot = core * mix(0.65, 1.05, b);
    haloColor = aura + rim + core * 0.3;
    alpha = clamp(core * 0.95 + aura * 0.85 + rim, 0.0, 1.0);
  } else {
    // 2: Ripple — beacon center + dual staggered concentric ripples
    float phase1 = fract(t * 0.48 + seed);
    float phase2 = fract(phase1 + 0.5);
    float core = smoothstep(0.2, 0.04, r);
    float aura = exp(-r * 4.5) * 0.38;
    float r1 = ringWave(r, phase1, 0.065);
    float r2 = ringWave(r, phase2, 0.065);
    float rings = clamp(r1 + r2, 0.0, 1.35);

    coreHot = core * 1.0 + rings * 0.25;
    haloColor = aura + rings * 1.1 + core * 0.3;
    alpha = clamp(core * 0.95 + aura * 0.55 + rings * 0.88, 0.0, 1.0);
  }

  // Smooth circular edge feathering to prevent any quad-boundary clipping
  float edgeMask = 1.0 - smoothstep(0.92, 1.0, r);
  material.diffuse = vec3(0.0);
  // Pack (coreHot, haloColor, 0.0) into emission for per-vertex RGB compositing
  material.emission = vec3(coreHot * u_glow, haloColor * u_glow, 0.0);
  material.alpha = clamp(alpha * edgeMask * u_opacity, 0.0, 1.0);
  return material;
}
`;

function hashPhase(index: number, lng: number, lat: number): number {
  const s = Math.sin(index * 12.9898 + lng * 78.233 + lat * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function validatePoints(points: readonly PulseScatterPoint[]): void {
  if (!Array.isArray(points)) {
    throw new TypeError('Expected points to be an array of PulseScatterPoint.');
  }
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    validateLngLat(pt.position, `points[${i}].position`);
    if (pt.radius !== undefined) {
      validatePositiveFinite(pt.radius, `points[${i}].radius`);
    }
    if (pt.height !== undefined && !Number.isFinite(pt.height)) {
      throw new RangeError(`Expected points[${i}].height to be a finite number.`);
    }
  }
}

function buildScatterGeometry(
  points: readonly PulseScatterPoint[],
  defaultRadius: number,
  sizeScale: number,
  defaultColor: Color,
  defaultHeight: number,
  ellipsoid: Viewer['scene']['ellipsoid'],
): Geometry | null {
  const count = points.length;
  if (count === 0) return null;

  const vertexCount = count * 4;
  const positions = new Float64Array(vertexCount * 3);
  const sts = new Float32Array(vertexCount * 2);
  const colors = new Uint8Array(vertexCount * 4);
  const indices = vertexCount > 65535 ? new Uint32Array(count * 6) : new Uint16Array(count * 6);

  const scratchCenter = new Cartesian3();
  const defaultR = Math.round(defaultColor.red * 255);
  const defaultG = Math.round(defaultColor.green * 255);
  const defaultB = Math.round(defaultColor.blue * 255);

  for (let i = 0; i < count; i += 1) {
    const pt = points[i]!;
    const [lng, lat] = pt.position;
    const lonRad = CesiumMath.toRadians(lng);
    const latRad = CesiumMath.toRadians(lat);
    const h = pt.height ?? defaultHeight;
    const r = (pt.radius ?? defaultRadius) * sizeScale;

    Cartesian3.fromRadians(lonRad, latRad, h, ellipsoid, scratchCenter);
    const cx = scratchCenter.x;
    const cy = scratchCenter.y;
    const cz = scratchCenter.z;

    // Fast analytical local East-North basis on the ellipsoid surface (zero Matrix4 allocations)
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    const ex = -sinLon * r;
    const ey = cosLon * r;
    const ez = 0;

    const nx = -sinLat * cosLon * r;
    const ny = -sinLat * sinLon * r;
    const nz = cosLat * r;

    const vBase = i * 4;
    const pBase = vBase * 3;
    // 0: SW (-E, -N)
    positions[pBase] = cx - ex - nx;
    positions[pBase + 1] = cy - ey - ny;
    positions[pBase + 2] = cz - ez - nz;
    // 1: SE (+E, -N)
    positions[pBase + 3] = cx + ex - nx;
    positions[pBase + 4] = cy + ey - ny;
    positions[pBase + 5] = cz + ez - nz;
    // 2: NE (+E, +N)
    positions[pBase + 6] = cx + ex + nx;
    positions[pBase + 7] = cy + ey + ny;
    positions[pBase + 8] = cz + ez + nz;
    // 3: NW (-E, +N)
    positions[pBase + 9] = cx - ex + nx;
    positions[pBase + 10] = cy - ey + ny;
    positions[pBase + 11] = cz - ez + nz;

    const stBase = vBase * 2;
    sts[stBase] = 0;
    sts[stBase + 1] = 0;
    sts[stBase + 2] = 1;
    sts[stBase + 3] = 0;
    sts[stBase + 4] = 1;
    sts[stBase + 5] = 1;
    sts[stBase + 6] = 0;
    sts[stBase + 7] = 1;

    let cr = defaultR;
    let cg = defaultG;
    let cb = defaultB;
    if (pt.color !== undefined) {
      const resolved = resolveColor(pt.color, defaultColor);
      cr = Math.round(resolved.red * 255);
      cg = Math.round(resolved.green * 255);
      cb = Math.round(resolved.blue * 255);
    }
    const phaseByte = Math.max(
      0,
      Math.min(
        255,
        Math.round(
          (pt.phase !== undefined && Number.isFinite(pt.phase)
            ? ((pt.phase % 1) + 1) % 1
            : hashPhase(i, lng, lat)) * 255,
        ),
      ),
    );

    const cBase = vBase * 4;
    for (let k = 0; k < 4; k += 1) {
      const o = cBase + k * 4;
      colors[o] = cr;
      colors[o + 1] = cg;
      colors[o + 2] = cb;
      colors[o + 3] = phaseByte;
    }

    const idxBase = i * 6;
    indices[idxBase] = vBase;
    indices[idxBase + 1] = vBase + 1;
    indices[idxBase + 2] = vBase + 2;
    indices[idxBase + 3] = vBase;
    indices[idxBase + 4] = vBase + 2;
    indices[idxBase + 5] = vBase + 3;
  }

  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: positions,
  });
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: sts,
  });
  attributes.color = new GeometryAttribute({
    componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
    componentsPerAttribute: 4,
    normalize: true,
    values: colors,
  });

  return new Geometry({
    attributes,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

/**
 * Adds a single-Draw-Call batched GPU pulsing / breathing scatter layer capable of rendering
 * tens of thousands of staggered animated points with per-point color, radius, and phase at 60fps.
 */
export function createPulseScatter(
  viewer: Viewer,
  options: PulseScatterOptions,
): PulseScatterHandle {
  validatePoints(options.points);

  const classificationType = options.classificationType ?? ClassificationType.BOTH;
  const state = {
    points: options.points,
    style: options.style ?? ('pulse' as PulseScatterStyle),
    radius: options.radius ?? 400,
    sizeScale: options.sizeScale ?? 1,
    color: resolveColor(options.color, Color.fromCssColorString('#00e5ff')),
    speed: options.speed ?? 1,
    opacity: options.opacity ?? 0.92,
    glow: options.glow ?? 1.15,
    height: options.height ?? 20,
    clampToGround: options.clampToGround ?? true,
  };

  validatePositiveFinite(state.radius, 'radius');
  validatePositiveFinite(state.sizeScale, 'sizeScale');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.opacity, 'opacity');
  validatePositiveFinite(state.glow, 'glow');
  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }

  const material = new Material({
    fabric: {
      type: 'CesiumlabPulseScatter',
      uniforms: {
        u_time: 0,
        u_style: STYLE_INDEX[state.style],
        u_speed: state.speed,
        u_opacity: state.opacity,
        u_glow: state.glow,
      },
      source: SCATTER_MATERIAL_SHADER,
    },
    translucent: true,
  });

  const buildAppearance = (): MaterialAppearance =>
    new MaterialAppearance({
      material,
      flat: true,
      translucent: true,
      closed: false,
      vertexShaderSource: SCATTER_VERTEX_SHADER,
      fragmentShaderSource: SCATTER_FRAGMENT_SHADER,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
      },
    });

  const ellipsoid = viewer.scene.ellipsoid;

  const buildInstancedDecalPrimitive = (): GroundInstancedDecalPrimitive | null => {
    if (state.points.length === 0) return null;
    const instances = state.points.map((pt, i) => {
      const [lng, lat] = pt.position;
      const phase =
        pt.phase !== undefined && Number.isFinite(pt.phase)
          ? ((pt.phase % 1) + 1) % 1
          : hashPhase(i, lng, lat);
      return {
        position: Cartesian3.fromDegrees(lng, lat, 0, ellipsoid),
        radius: (pt.radius ?? state.radius) * state.sizeScale,
        color: pt.color !== undefined ? resolveColor(pt.color, state.color) : state.color,
        phase,
      };
    });
    return new GroundInstancedDecalPrimitive({
      instances,
      material,
      classificationType,
    });
  };

  const buildFlatPrimitive = (): Primitive | null => {
    const geometry = buildScatterGeometry(
      state.points,
      state.radius,
      state.sizeScale,
      state.color,
      state.height,
      ellipsoid,
    );
    if (!geometry) return null;
    return new Primitive({
      geometryInstances: new GeometryInstance({ geometry }),
      appearance: buildAppearance(),
      asynchronous: false,
    });
  };

  const buildPrimitive = (): Primitive | GroundInstancedDecalPrimitive | null =>
    state.clampToGround ? buildInstancedDecalPrimitive() : buildFlatPrimitive();

  let primitive: Primitive | GroundInstancedDecalPrimitive | null = buildPrimitive();
  let visible = options.show ?? true;
  if (primitive) {
    primitive.show = visible;
    viewer.scene.primitives.add(primitive);
  }

  const rebuildPrimitive = () => {
    if (viewer.isDestroyed()) return;
    if (primitive) {
      viewer.scene.primitives.remove(primitive);
    }
    primitive = buildPrimitive();
    if (primitive) {
      primitive.show = visible;
      viewer.scene.primitives.add(primitive);
    }
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
  });

  const handle = createPrimitiveEffectHandle<PulseScatterUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => (primitive ? [primitive] : []),
    onUpdate(next) {
      let needsRebuild = false;

      if (next.points !== undefined) {
        validatePoints(next.points);
        state.points = next.points;
        needsRebuild = true;
      }
      if (next.radius !== undefined) {
        validatePositiveFinite(next.radius, 'radius');
        if (next.radius !== state.radius) {
          state.radius = next.radius;
          needsRebuild = true;
        }
      }
      if (next.sizeScale !== undefined) {
        validatePositiveFinite(next.sizeScale, 'sizeScale');
        if (next.sizeScale !== state.sizeScale) {
          state.sizeScale = next.sizeScale;
          needsRebuild = true;
        }
      }
      if (next.color !== undefined) {
        const nextColor = resolveColor(next.color, state.color);
        if (!Color.equals(nextColor, state.color)) {
          state.color = nextColor;
          needsRebuild = true;
        }
      }
      if (next.height !== undefined) {
        if (!Number.isFinite(next.height)) {
          throw new RangeError('Expected height to be a finite number.');
        }
        if (next.height !== state.height) {
          state.height = next.height;
          if (!state.clampToGround) {
            needsRebuild = true;
          }
        }
      }
      if (next.clampToGround !== undefined && next.clampToGround !== state.clampToGround) {
        state.clampToGround = next.clampToGround;
        needsRebuild = true;
      }

      // O(1) GPU uniform updates (zero geometry rebuild)
      if (next.style !== undefined) {
        state.style = next.style;
        material.uniforms.u_style = STYLE_INDEX[state.style];
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
        material.uniforms.u_speed = state.speed;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = Math.min(1, next.opacity);
        material.uniforms.u_opacity = state.opacity;
      }
      if (next.glow !== undefined) {
        validatePositiveFinite(next.glow, 'glow');
        state.glow = next.glow;
        material.uniforms.u_glow = state.glow;
      }

      if (needsRebuild) {
        rebuildPrimitive();
      }
    },
    onRestart() {
      material.uniforms.u_time = 0;
    },
  });

  // Track visibility across rebuilds
  return {
    ...handle,
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      handle.setVisible(nextVisible);
    },
    show() {
      visible = true;
      handle.setVisible(true);
    },
    hide() {
      visible = false;
      handle.setVisible(false);
    },
  };
}
