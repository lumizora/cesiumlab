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
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export type HexPrismShape = 'hex' | 'square';
export type HexPrismPalette = 'cyber' | 'thermal' | 'viridis' | 'ocean';

export interface HexPrismPoint {
  /** Geographic coordinate `[longitude, latitude]` in degrees. */
  position: LngLat;
  /** Numeric weight / metric driving prism height and palette color. Defaults to 1. */
  value?: number;
  /** Optional explicit color override (used when `aggregate` is `false`). */
  color?: ColorInput;
}

export interface HexPrismOptions extends EffectBaseOptions {
  /** Input data points to render as 3D hexagonal or square prisms (auto-aggregated by default). */
  points: readonly HexPrismPoint[];
  /** Cross-section geometry: `'hex'` (6-sided honeycomb) or `'square'` (4-sided column). Defaults to `'hex'`. */
  shape?: HexPrismShape;
  /** Aggregate nearby points into a regular honeycomb/square grid (`true`) or place one prism per point (`false`). Defaults to `true`. */
  aggregate?: boolean;
  /** Cell outer radius in metres. Defaults to 350. */
  cellRadius?: number;
  /** Fill ratio within each grid cell (0.3 to 1.0) controlling inter-column spacing. Defaults to 0.86. */
  coverage?: number;
  /** Base altitude above the ellipsoid in metres. Defaults to 0. */
  baseHeight?: number;
  /** Minimum prism height in metres for the lowest non-zero value. Defaults to 80. */
  minHeight?: number;
  /** Maximum prism height in metres for the highest value. Defaults to 2_400. */
  maxHeight?: number;
  /** Real-time O(1) vertical height scale multiplier. Defaults to 1. */
  elevationScale?: number;
  /** Built-in 5-stop GPU color ramp (`'cyber' | 'thermal' | 'viridis' | 'ocean'`). Defaults to `'cyber'`. */
  palette?: HexPrismPalette;
  /** Smooth ease-out-cubic rising growth animation duration in seconds (0 disables). Defaults to 1.2. */
  growDuration?: number;
  /** Speed multiplier for the subtle upward luminous energy scan pulse. Defaults to 1. */
  pulseSpeed?: number;
  /** Overall opacity (0.1 to 1). Defaults to 0.92. */
  opacity?: number;
}

export type HexPrismUpdateOptions = Partial<
  Pick<
    HexPrismOptions,
    | 'points'
    | 'shape'
    | 'aggregate'
    | 'cellRadius'
    | 'coverage'
    | 'baseHeight'
    | 'minHeight'
    | 'maxHeight'
    | 'elevationScale'
    | 'palette'
    | 'growDuration'
    | 'pulseSpeed'
    | 'opacity'
  >
>;

export type HexPrismHandle = EffectHandle<HexPrismUpdateOptions>;

const PALETTE_INDEX: Record<HexPrismPalette, number> = {
  cyber: 0,
  thermal: 1,
  viridis: 2,
  ocean: 3,
};

const HEX_PRISM_VERTEX_SHADER = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in vec4 color;
in float batchId;

out vec3 v_normalEC;
out vec3 v_positionEC;
out vec2 v_st;
out vec4 v_color;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = normalize(czm_normal * normal);
  v_st = st;
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

const HEX_PRISM_FRAGMENT_SHADER = /* glsl */ `
in vec3 v_normalEC;
in vec3 v_positionEC;
in vec2 v_st;
in vec4 v_color;

void main() {
  czm_materialInput materialInput;
  materialInput.s = v_st.s;
  materialInput.st = v_st;
  materialInput.str = vec3(v_st, v_color.a);
  materialInput.normalEC = normalize(v_normalEC);
  materialInput.positionToEyeEC = -v_positionEC;

  czm_material material = czm_getMaterial(materialInput);
  vec3 customTint = v_color.a > 0.5 ? v_color.rgb : material.emission;
  // Re-apply vertical lighting/scan modulation computed in material.diffuse.r
  vec3 finalRgb = v_color.a > 0.5 ? (customTint * material.diffuse.r + vec3(material.diffuse.g)) : material.emission;
  out_FragColor = vec4(finalRgb, material.alpha);
}
`;

const HEX_PRISM_MATERIAL_SHADER = /* glsl */ `
uniform float u_time;
uniform float u_palette;
uniform float u_pulseSpeed;
uniform float u_opacity;

vec3 ramp5(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  return mix(c3, c4, x - 3.0);
}

vec3 samplePalette(float t, float paletteIdx) {
  if (paletteIdx < 0.5) {
    // cyber: deep indigo -> electric blue -> cyan -> emerald -> bright white-cyan
    return ramp5(
      t,
      vec3(0.08, 0.14, 0.42),
      vec3(0.04, 0.42, 0.88),
      vec3(0.00, 0.80, 0.96),
      vec3(0.18, 0.95, 0.72),
      vec3(0.86, 1.00, 0.96)
    );
  }
  if (paletteIdx < 1.5) {
    // thermal: dark violet -> crimson -> orange -> gold -> white-yellow
    return ramp5(
      t,
      vec3(0.18, 0.05, 0.34),
      vec3(0.68, 0.10, 0.32),
      vec3(0.95, 0.36, 0.08),
      vec3(1.00, 0.78, 0.12),
      vec3(1.00, 0.98, 0.80)
    );
  }
  if (paletteIdx < 2.5) {
    // viridis: deep purple -> slate blue -> teal -> lime -> bright yellow
    return ramp5(
      t,
      vec3(0.26, 0.01, 0.33),
      vec3(0.23, 0.32, 0.55),
      vec3(0.13, 0.57, 0.55),
      vec3(0.37, 0.79, 0.38),
      vec3(0.99, 0.91, 0.15)
    );
  }
  // ocean: abyssal navy -> cobalt -> turquoise -> aquamarine -> foam white
  return ramp5(
    t,
    vec3(0.04, 0.10, 0.28),
    vec3(0.05, 0.32, 0.62),
    vec3(0.04, 0.64, 0.78),
    vec3(0.32, 0.88, 0.88),
    vec3(0.88, 0.98, 1.00)
  );
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  // st.s: 0..1 vertical height fraction on side walls; > 1.5 indicates top cap
  float isTop = step(1.5, materialInput.st.s);
  float hFrac = clamp(materialInput.st.s, 0.0, 1.0);
  float val = clamp(materialInput.st.t, 0.0, 1.0);

  vec3 baseColor = samplePalette(val, u_palette);

  // Crisp 3D directional facet shading in eye space
  vec3 lightDir = normalize(vec3(0.45, 0.62, 0.64));
  vec3 n = normalize(materialInput.normalEC);
  float diff = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);
  float facetLight = mix(0.62, 1.12, diff);

  // Vertical energy gradient: darker anchored base -> bright luminous crown
  float vertGrad = mix(0.34, 1.12, pow(hFrac, 0.75));
  float rimTop = smoothstep(0.86, 1.0, hFrac) * 0.28;

  // Subtle upward energy pulse traveling up taller towers
  float scanPhase = fract(hFrac * 1.4 - u_time * u_pulseSpeed * 0.45 + val * 1.7);
  float scanBand = exp(-pow((scanPhase - 0.5) / 0.11, 2.0)) * 0.24 * step(0.01, u_pulseSpeed);

  // Top cap gets bright crisp crown highlight
  float shadeMul = mix(vertGrad * facetLight, 1.18 * facetLight, isTop);
  float whiteSpec = mix(rimTop + scanBand, 0.22 + scanBand * 0.5, isTop);

  vec3 shadedRgb = baseColor * shadeMul + mix(baseColor, vec3(1.0), 0.65) * whiteSpec;

  material.diffuse = vec3(shadeMul, whiteSpec * 0.5, 0.0);
  material.emission = shadedRgb;
  material.alpha = clamp(u_opacity * mix(0.82 + 0.18 * hFrac, 1.0, isTop), 0.0, 1.0);
  return material;
}
`;

interface ResolvedPrismCell {
  x: number;
  y: number;
  value: number;
  customColor?: Color;
}

const SQRT3 = Math.sqrt(3);

function buildPrismCells(
  points: readonly HexPrismPoint[],
  shape: HexPrismShape,
  aggregate: boolean,
  cellRadius: number,
  centroidLng: number,
  centroidLat: number,
): { cells: ResolvedPrismCell[]; maxExtent: number } {
  const latRad = (centroidLat * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = Math.max(1, 111_320 * Math.cos(latRad));

  if (!aggregate) {
    let maxVal = 0;
    const raw: Array<{ x: number; y: number; value: number; color?: Color }> = [];
    let maxExtent = cellRadius;
    for (const pt of points) {
      const x = (pt.position[0] - centroidLng) * metersPerDegLng;
      const y = (pt.position[1] - centroidLat) * metersPerDegLat;
      const v = Math.max(0, pt.value ?? 1);
      if (v > maxVal) maxVal = v;
      const ext = Math.hypot(x, y) + cellRadius;
      if (ext > maxExtent) maxExtent = ext;
      raw.push({
        x,
        y,
        value: v,
        color: pt.color !== undefined ? resolveColor(pt.color, Color.CYAN) : undefined,
      });
    }
    const invMax = maxVal > 0 ? 1 / maxVal : 1;
    return {
      cells: raw.map((c) => ({
        x: c.x,
        y: c.y,
        value: Math.min(1, c.value * invMax),
        customColor: c.color,
      })),
      maxExtent,
    };
  }

  // Spatial binning into either flat-top axial hex grid or regular square grid
  const buckets = new Map<string, { x: number; y: number; sum: number }>();

  if (shape === 'hex') {
    const r = cellRadius;
    for (const pt of points) {
      const px = (pt.position[0] - centroidLng) * metersPerDegLng;
      const py = (pt.position[1] - centroidLat) * metersPerDegLat;
      const v = Math.max(0, pt.value ?? 1);

      // Fractional flat-top axial coordinates (q, s_axial)
      const fq = ((2 / 3) * px) / r;
      const fr = ((-1 / 3) * px + (SQRT3 / 3) * py) / r;
      const fs = -fq - fr;

      let rq = Math.round(fq);
      let rr = Math.round(fr);
      const rs = Math.round(fs);
      const dq = Math.abs(rq - fq);
      const dr = Math.abs(rr - fr);
      const ds = Math.abs(rs - fs);
      if (dq > dr && dq > ds) {
        rq = -rr - rs;
      } else if (dr > ds) {
        rr = -rq - rs;
      }

      const key = `${rq},${rr}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.sum += v;
      } else {
        const cx = r * 1.5 * rq;
        const cy = r * SQRT3 * (rr + rq * 0.5);
        buckets.set(key, { x: cx, y: cy, sum: v });
      }
    }
  } else {
    const step = cellRadius * 2;
    for (const pt of points) {
      const px = (pt.position[0] - centroidLng) * metersPerDegLng;
      const py = (pt.position[1] - centroidLat) * metersPerDegLat;
      const v = Math.max(0, pt.value ?? 1);
      const gx = Math.round(px / step);
      const gy = Math.round(py / step);
      const key = `${gx},${gy}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.sum += v;
      } else {
        buckets.set(key, { x: gx * step, y: gy * step, sum: v });
      }
    }
  }

  let maxSum = 0;
  let maxExtent = cellRadius;
  for (const b of buckets.values()) {
    if (b.sum > maxSum) maxSum = b.sum;
    const ext = Math.hypot(b.x, b.y) + cellRadius;
    if (ext > maxExtent) maxExtent = ext;
  }

  const invMax = maxSum > 0 ? 1 / maxSum : 1;
  const cells: ResolvedPrismCell[] = [];
  for (const b of buckets.values()) {
    if (b.sum <= 0) continue;
    cells.push({
      x: b.x,
      y: b.y,
      value: Math.min(1, b.sum * invMax),
    });
  }

  return { cells, maxExtent };
}

function buildMergedPrismGeometry(
  cells: readonly ResolvedPrismCell[],
  shape: HexPrismShape,
  cellRadius: number,
  coverage: number,
  minHeight: number,
  maxHeight: number,
): Geometry {
  const sides = shape === 'hex' ? 6 : 4;
  const r = cellRadius * Math.max(0.3, Math.min(1, coverage));
  const angleOffset = shape === 'hex' ? 0 : Math.PI / 4;

  // Precompute unit polygon ring
  const ringX = new Float64Array(sides);
  const ringY = new Float64Array(sides);
  const faceNx = new Float64Array(sides);
  const faceNy = new Float64Array(sides);
  for (let i = 0; i < sides; i++) {
    const a = angleOffset + (i * Math.PI * 2) / sides;
    ringX[i] = Math.cos(a) * r;
    ringY[i] = Math.sin(a) * r;
  }
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const ex = ringX[next]! - ringX[i]!;
    const ey = ringY[next]! - ringY[i]!;
    // Outward normal for CCW polygon in XY plane is (ey, -ex)
    const len = Math.hypot(ex, ey) || 1;
    faceNx[i] = ey / len;
    faceNy[i] = -ex / len;
  }

  // Per prism:
  // - Side faces: `sides` quads = `sides * 4` vertices, `sides * 6` indices (flat-shaded per facet!)
  // - Top cap: `1 + sides` vertices, `sides * 3` indices
  const vertsPerPrism = sides * 4 + (sides + 1);
  const indicesPerPrism = sides * 6 + sides * 3;
  const totalVerts = cells.length * vertsPerPrism;
  const totalIndices = cells.length * indicesPerPrism;

  const positions = new Float64Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const sts = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 4);
  const indices =
    totalVerts > 65_535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  const writeVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    s: number,
    t: number,
    cr: number,
    cg: number,
    cb: number,
    ca: number,
  ) => {
    const p3 = vOffset * 3;
    const p2 = vOffset * 2;
    const p4 = vOffset * 4;
    positions[p3] = x;
    positions[p3 + 1] = y;
    positions[p3 + 2] = z;
    normals[p3] = nx;
    normals[p3 + 1] = ny;
    normals[p3 + 2] = nz;
    sts[p2] = s;
    sts[p2 + 1] = t;
    colors[p4] = cr;
    colors[p4 + 1] = cg;
    colors[p4 + 2] = cb;
    colors[p4 + 3] = ca;
    return vOffset++;
  };

  for (const cell of cells) {
    const h = minHeight + (maxHeight - minHeight) * cell.value;
    const cr = cell.customColor ? cell.customColor.red : 0;
    const cg = cell.customColor ? cell.customColor.green : 0;
    const cb = cell.customColor ? cell.customColor.blue : 0;
    const ca = cell.customColor ? 1 : 0;

    // Side quads
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const x0 = cell.x + ringX[i]!;
      const y0 = cell.y + ringY[i]!;
      const x1 = cell.x + ringX[next]!;
      const y1 = cell.y + ringY[next]!;
      const nx = faceNx[i]!;
      const ny = faceNy[i]!;

      const b0 = writeVertex(x0, y0, 0, nx, ny, 0, 0, cell.value, cr, cg, cb, ca);
      const b1 = writeVertex(x1, y1, 0, nx, ny, 0, 0, cell.value, cr, cg, cb, ca);
      const t1 = writeVertex(x1, y1, h, nx, ny, 0, 1, cell.value, cr, cg, cb, ca);
      const t0 = writeVertex(x0, y0, h, nx, ny, 0, 1, cell.value, cr, cg, cb, ca);

      indices[iOffset++] = b0;
      indices[iOffset++] = b1;
      indices[iOffset++] = t1;
      indices[iOffset++] = b0;
      indices[iOffset++] = t1;
      indices[iOffset++] = t0;
    }

    // Top cap (st.s = 2.0 marks top cap cleanly in fragment shader)
    const centerIdx = writeVertex(cell.x, cell.y, h, 0, 0, 1, 2, cell.value, cr, cg, cb, ca);
    const ringStart = vOffset;
    for (let i = 0; i < sides; i++) {
      writeVertex(
        cell.x + ringX[i]!,
        cell.y + ringY[i]!,
        h,
        0,
        0,
        1,
        2,
        cell.value,
        cr,
        cg,
        cb,
        ca,
      );
    }
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      indices[iOffset++] = centerIdx;
      indices[iOffset++] = ringStart + i;
      indices[iOffset++] = ringStart + next;
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
  attributes.color = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 4,
    values: colors,
  });

  return new Geometry({
    attributes,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions as unknown as number[]),
  });
}

function validatePoints(points: readonly HexPrismPoint[]): void {
  if (!Array.isArray(points) || points.length === 0) {
    throw new RangeError('Expected points to be a non-empty array.');
  }
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt) throw new RangeError(`Expected points[${i}] to be defined.`);
    validateLngLat(pt.position, `points[${i}].position`);
    if (pt.value !== undefined) {
      validateNonNegativeFinite(pt.value, `points[${i}].value`);
    }
  }
}

/**
 * Renders thousands of 3D hexagonal or square data prisms in a single GPU Draw Call,
 * with automatic honeycomb spatial aggregation, 5-stop GPU color ramps, O(1) real-time
 * height scaling, and smooth ease-out-cubic rising growth animation.
 */
export function createHexPrism(viewer: Viewer, options: HexPrismOptions): HexPrismHandle {
  validatePoints(options.points);

  const state = {
    points: options.points,
    shape: (options.shape ?? 'hex') as HexPrismShape,
    aggregate: options.aggregate ?? true,
    cellRadius: options.cellRadius ?? 350,
    coverage: options.coverage ?? 0.86,
    baseHeight: options.baseHeight ?? 0,
    minHeight: options.minHeight ?? 80,
    maxHeight: options.maxHeight ?? 2_400,
    elevationScale: options.elevationScale ?? 1,
    palette: (options.palette ?? 'cyber') as HexPrismPalette,
    growDuration: options.growDuration ?? 1.2,
    pulseSpeed: options.pulseSpeed ?? 1,
    opacity: options.opacity ?? 0.92,
  };

  validatePositiveFinite(state.cellRadius, 'cellRadius');
  validatePositiveFinite(state.coverage, 'coverage');
  if (!Number.isFinite(state.baseHeight)) {
    throw new RangeError('Expected baseHeight to be a finite number.');
  }
  validateNonNegativeFinite(state.minHeight, 'minHeight');
  validatePositiveFinite(state.maxHeight, 'maxHeight');
  validatePositiveFinite(state.elevationScale, 'elevationScale');
  validateNonNegativeFinite(state.growDuration, 'growDuration');
  validateNonNegativeFinite(state.pulseSpeed, 'pulseSpeed');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const material = new Material({
    fabric: {
      type: `CesiumlabHexPrism_${Math.random().toString(36).slice(2, 9)}`,
      uniforms: {
        u_time: 0,
        u_palette: PALETTE_INDEX[state.palette],
        u_pulseSpeed: state.pulseSpeed,
        u_opacity: state.opacity,
      },
      source: HEX_PRISM_MATERIAL_SHADER,
    },
    translucent: true,
  });

  const baseEnuMatrix = new Matrix4();
  const scaleScratch = new Cartesian3(1, 1, 1);
  const scaleMatrixScratch = new Matrix4();
  let growProgress = state.growDuration > 0 ? 0.001 : 1;

  const computeEffectiveZScale = (): number => {
    const eased = 1 - Math.pow(1 - Math.max(0, Math.min(1, growProgress)), 3);
    return Math.max(0.001, state.elevationScale * eased);
  };

  const applyModelMatrix = (target: Primitive) => {
    scaleScratch.x = 1;
    scaleScratch.y = 1;
    scaleScratch.z = computeEffectiveZScale();
    Matrix4.fromScale(scaleScratch, scaleMatrixScratch);
    Matrix4.multiply(baseEnuMatrix, scaleMatrixScratch, target.modelMatrix);
  };

  const buildPrimitive = (): Primitive => {
    let sumLng = 0;
    let sumLat = 0;
    for (const pt of state.points) {
      sumLng += pt.position[0];
      sumLat += pt.position[1];
    }
    const centroidLng = sumLng / state.points.length;
    const centroidLat = sumLat / state.points.length;

    const ellipsoid = viewer.scene.globe?.ellipsoid;
    const origin = Cartesian3.fromDegrees(centroidLng, centroidLat, state.baseHeight, ellipsoid);
    Transforms.eastNorthUpToFixedFrame(origin, ellipsoid, baseEnuMatrix);

    const { cells } = buildPrismCells(
      state.points,
      state.shape,
      state.aggregate,
      state.cellRadius,
      centroidLng,
      centroidLat,
    );

    const geometry = buildMergedPrismGeometry(
      cells,
      state.shape,
      state.cellRadius,
      state.coverage,
      state.minHeight,
      state.maxHeight,
    );

    const p = new Primitive({
      geometryInstances: new GeometryInstance({ geometry }),
      modelMatrix: Matrix4.clone(baseEnuMatrix),
      appearance: new MaterialAppearance({
        material,
        vertexShaderSource: HEX_PRISM_VERTEX_SHADER,
        fragmentShaderSource: HEX_PRISM_FRAGMENT_SHADER,
        translucent: true,
        closed: false,
        renderState: {
          depthTest: { enabled: true },
          depthMask: true,
          blending: BlendingState.ALPHA_BLEND,
        },
      }),
      asynchronous: false,
    });
    applyModelMatrix(p);
    return p;
  };

  let primitive: Primitive = buildPrimitive();
  viewer.scene.primitives.add(primitive);

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    material.uniforms.u_time = elapsedSeconds;
    if (state.growDuration > 0 && growProgress < 1) {
      growProgress = Math.min(1, elapsedSeconds / state.growDuration);
      applyModelMatrix(primitive);
    }
  });

  const rebuild = () => {
    if (viewer.isDestroyed()) return;
    const wasVisible = primitive.show;
    viewer.scene.primitives.remove(primitive);
    primitive = buildPrimitive();
    primitive.show = wasVisible;
    viewer.scene.primitives.add(primitive);
  };

  const handle = createPrimitiveEffectHandle<HexPrismUpdateOptions>({
    viewer,
    clock,
    getCollection: () => viewer.scene.primitives,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      let geometryDirty = false;
      let scaleDirty = false;

      if (next.points !== undefined) {
        validatePoints(next.points);
        state.points = next.points;
        geometryDirty = true;
      }
      if (next.shape !== undefined && next.shape !== state.shape) {
        state.shape = next.shape;
        geometryDirty = true;
      }
      if (next.aggregate !== undefined && next.aggregate !== state.aggregate) {
        state.aggregate = next.aggregate;
        geometryDirty = true;
      }
      if (next.cellRadius !== undefined && next.cellRadius !== state.cellRadius) {
        validatePositiveFinite(next.cellRadius, 'cellRadius');
        state.cellRadius = next.cellRadius;
        geometryDirty = true;
      }
      if (next.coverage !== undefined && next.coverage !== state.coverage) {
        validatePositiveFinite(next.coverage, 'coverage');
        state.coverage = next.coverage;
        geometryDirty = true;
      }
      if (next.baseHeight !== undefined && next.baseHeight !== state.baseHeight) {
        if (!Number.isFinite(next.baseHeight)) {
          throw new RangeError('Expected baseHeight to be a finite number.');
        }
        state.baseHeight = next.baseHeight;
        geometryDirty = true;
      }
      if (next.minHeight !== undefined && next.minHeight !== state.minHeight) {
        validateNonNegativeFinite(next.minHeight, 'minHeight');
        state.minHeight = next.minHeight;
        geometryDirty = true;
      }
      if (next.maxHeight !== undefined && next.maxHeight !== state.maxHeight) {
        validatePositiveFinite(next.maxHeight, 'maxHeight');
        state.maxHeight = next.maxHeight;
        geometryDirty = true;
      }
      if (next.elevationScale !== undefined) {
        validatePositiveFinite(next.elevationScale, 'elevationScale');
        state.elevationScale = next.elevationScale;
        scaleDirty = true;
      }
      if (next.palette !== undefined) {
        state.palette = next.palette;
        material.uniforms.u_palette = PALETTE_INDEX[state.palette];
      }
      if (next.growDuration !== undefined) {
        validateNonNegativeFinite(next.growDuration, 'growDuration');
        state.growDuration = next.growDuration;
      }
      if (next.pulseSpeed !== undefined) {
        validateNonNegativeFinite(next.pulseSpeed, 'pulseSpeed');
        state.pulseSpeed = next.pulseSpeed;
        material.uniforms.u_pulseSpeed = state.pulseSpeed;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        material.uniforms.u_opacity = state.opacity;
      }

      if (geometryDirty) {
        rebuild();
      } else if (scaleDirty) {
        applyModelMatrix(primitive);
      }
    },
  });

  return {
    ...handle,
    restart() {
      if (handle.isDestroyed()) return;
      growProgress = state.growDuration > 0 ? 0.001 : 1;
      applyModelMatrix(primitive);
      handle.restart();
    },
  };
}
