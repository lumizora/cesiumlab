import {
  BlendingState,
  ClassificationType,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  GroundPrimitive,
  Material,
  MaterialAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  type Viewer,
} from 'cesium';
import { createAnimationClock } from '../shared/clock.ts';
import {
  createPrimitiveEffectHandle,
  type EffectBaseOptions,
  type EffectHandle,
} from '../shared/effect.ts';
import { validateNonNegativeFinite, validatePositiveFinite } from '../shared/geo.ts';
import {
  WindFieldEngine,
  type WindFieldGrid,
  type WindFieldPalette,
  type WindFieldPreset,
} from './engine.ts';

export type { WindFieldGrid, WindFieldPalette, WindFieldPreset } from './engine.ts';
export type WindFieldBounds = readonly [west: number, south: number, east: number, north: number];

export interface WindFieldOptions extends EffectBaseOptions {
  /** Geographic rectangle `[west, south, east, north]` in degrees where streamlines flow. */
  bounds: WindFieldBounds;
  /** Built-in analytical vector field preset (used when `field` is omitted). Defaults to `'typhoon'`. */
  preset?: WindFieldPreset;
  /** Optional custom 2D U/V meteorological or ocean velocity grid overriding `preset`. */
  field?: WindFieldGrid;
  /** Number of active streamline particles (200 to 30_000). Defaults to 6_000. */
  particleCount?: number;
  /** Anti-aliased streamline thickness in offscreen texels (0.8 to 6). Defaults to 2.2. */
  lineWidth?: number;
  /** Offscreen trail texture resolution in pixels (256 to 2048). Defaults to 2048. */
  resolution?: number;
  /** Advection speed multiplier. Defaults to 1. */
  speed?: number;
  /** Per-frame trail persistence factor in [0.84, 0.992]. Higher = longer tails. Defaults to 0.962. */
  fadeOpacity?: number;
  /** Speed-to-color ramp palette (`'wind' | 'ocean' | 'thermal'`). Defaults to `'wind'`. */
  palette?: WindFieldPalette;
  /** Overall layer opacity multiplier (0 to 1). Defaults to 0.92. */
  opacity?: number;
  /**
   * Drape the streamlines onto terrain and sea surface via `GroundPrimitive`.
   * Set to `false` to render on a floating isobaric layer at `height`. Defaults to `true`.
   */
  clampToGround?: boolean;
  /** Altitude above the ellipsoid in metres when `clampToGround` is `false`. Defaults to 15_000. */
  height?: number;
  /** Classification target when `clampToGround` is `true`. Defaults to `ClassificationType.BOTH`. */
  classificationType?: ClassificationType;
}

export type WindFieldUpdateOptions = Partial<
  Pick<
    WindFieldOptions,
    | 'preset'
    | 'field'
    | 'particleCount'
    | 'lineWidth'
    | 'speed'
    | 'fadeOpacity'
    | 'palette'
    | 'opacity'
    | 'clampToGround'
    | 'height'
  >
>;

export interface WindFieldHandle extends EffectHandle<WindFieldUpdateOptions> {
  /** Clears the accumulated streamline trail buffers immediately. */
  clear(): void;
}

const WIND_SURFACE_SHADER = /* glsl */ `
uniform sampler2D u_wind;
uniform float u_opacity;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 tex = texture(u_wind, materialInput.st);
  material.diffuse = vec3(0.0);
  material.emission = tex.rgb;
  material.alpha = clamp(tex.a * u_opacity, 0.0, 0.96);
  return material;
}
`;

function validateBounds(bounds: WindFieldBounds): void {
  const [west, south, east, north] = bounds;
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new RangeError('Expected bounds [west, south, east, north] to be finite degrees.');
  }
  if (west < -180 || east > 180 || west >= east) {
    throw new RangeError('Expected bounds longitude west < east within [-180, 180].');
  }
  if (south < -90 || north > 90 || south >= north) {
    throw new RangeError('Expected bounds latitude south < north within [-90, 90].');
  }
}

function validateField(field: WindFieldGrid): void {
  if (!Number.isInteger(field.width) || field.width < 2) {
    throw new RangeError('Expected field.width to be an integer >= 2.');
  }
  if (!Number.isInteger(field.height) || field.height < 2) {
    throw new RangeError('Expected field.height to be an integer >= 2.');
  }
  const expected = field.width * field.height;
  if (field.u.length !== expected || field.v.length !== expected) {
    throw new RangeError(`Expected field.u and field.v to have length ${expected}.`);
  }
}

function createPresentCanvas(
  size: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

/**
 * Adds a GPU-accelerated particle streamline wind / ocean current field rendered via
 * offscreen WebGL2 trail-accumulation FBOs and seamlessly switchable between
 * terrain/ocean-clamped `GroundPrimitive` and elevated isobaric `Primitive`.
 */
export function createWindField(viewer: Viewer, options: WindFieldOptions): WindFieldHandle {
  validateBounds(options.bounds);
  const [west, south, east, north] = options.bounds;
  if (options.field) {
    validateField(options.field);
  }

  const resolution = Math.max(256, Math.min(2048, Math.round(options.resolution ?? 2048)));
  const classificationType = options.classificationType ?? ClassificationType.BOTH;

  const state = {
    preset: options.preset ?? ('typhoon' as WindFieldPreset),
    field: options.field,
    particleCount: options.particleCount ?? 6_000,
    lineWidth: options.lineWidth ?? 2.2,
    speed: options.speed ?? 1,
    fadeOpacity: options.fadeOpacity ?? 0.962,
    palette: options.palette ?? ('wind' as WindFieldPalette),
    opacity: options.opacity ?? 0.92,
    clampToGround: options.clampToGround ?? true,
    height: options.height ?? 15_000,
  };

  validatePositiveFinite(state.particleCount, 'particleCount');
  validatePositiveFinite(state.lineWidth, 'lineWidth');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.fadeOpacity, 'fadeOpacity');
  validateNonNegativeFinite(state.opacity, 'opacity');
  if (!Number.isFinite(state.height)) {
    throw new RangeError('Expected height to be a finite number.');
  }

  const engine = WindFieldEngine.create({
    resolution,
    particleCount: state.particleCount,
    lineWidth: state.lineWidth,
    speed: state.speed,
    fadeOpacity: state.fadeOpacity,
    palette: state.palette,
    preset: state.preset,
    field: state.field,
  });

  const canvasSize = engine?.resolution ?? 16;
  const presentA = createPresentCanvas(canvasSize);
  const presentB = createPresentCanvas(canvasSize);
  const presentPair = presentA && presentB ? ([presentA, presentB] as const) : null;
  let presentIndex = 0;

  // Initialize fabric.uniforms with Material.DefaultImageId so Cesium's Material cache
  // never attempts to clone an HTMLCanvasElement across remounts.
  const material = new Material({
    fabric: {
      type: 'CesiumlabWindField',
      uniforms: {
        u_wind: Material.DefaultImageId,
        u_opacity: state.opacity,
      },
      source: WIND_SURFACE_SHADER,
    },
    translucent: true,
  });

  const presentFrame = (): void => {
    if (!engine || !presentPair) return;
    presentIndex = 1 - presentIndex;
    const slot = presentPair[presentIndex];
    if (!slot.ctx) return;
    slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
    slot.ctx.drawImage(engine.canvas, 0, 0);
    material.uniforms.u_wind = slot.canvas;
  };

  // Pre-warm streamlines so frame 1 is immediately rich and legible
  if (engine) {
    for (let i = 0; i < 24; i += 1) {
      engine.step(1 / 60);
    }
    presentFrame();
  }

  const ellipsoid = viewer.scene.ellipsoid;
  const rectangle = Rectangle.fromDegrees(west, south, east, north);

  const buildGroundPrimitive = (): GroundPrimitive =>
    new GroundPrimitive({
      geometryInstances: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle,
          ellipsoid,
        }),
      }),
      appearance: new MaterialAppearance({
        material,
        flat: true,
        translucent: true,
      }),
      classificationType,
      asynchronous: true,
    });

  const buildFlatPrimitive = (altitude: number): Primitive =>
    new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle,
          height: altitude,
          ellipsoid,
          vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new EllipsoidSurfaceAppearance({
        material,
        flat: true,
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

  let activeInGround = state.clampToGround;
  let primitive: GroundPrimitive | Primitive = activeInGround
    ? buildGroundPrimitive()
    : buildFlatPrimitive(state.height);

  const getActiveCollection = () =>
    activeInGround
      ? (viewer.scene.groundPrimitives ?? viewer.scene.primitives)
      : viewer.scene.primitives;

  getActiveCollection().add(primitive);

  const swapPrimitive = (nextClamped: boolean, nextPrimitive: GroundPrimitive | Primitive) => {
    if (viewer.isDestroyed()) return;
    const wasVisible = primitive.show;
    getActiveCollection().remove(primitive);
    activeInGround = nextClamped;
    primitive = nextPrimitive;
    primitive.show = wasVisible;
    getActiveCollection().add(primitive);
  };

  let prevElapsed = 0;
  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    if (!engine || !primitive.show) {
      prevElapsed = elapsedSeconds;
      return;
    }
    const dt = Math.min(0.033, Math.max(0.004, elapsedSeconds - prevElapsed));
    prevElapsed = elapsedSeconds;
    engine.step(dt);
    presentFrame();
  });

  const baseHandle = createPrimitiveEffectHandle<WindFieldUpdateOptions>({
    viewer,
    clock,
    getCollection: getActiveCollection,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.field !== undefined) {
        validateField(next.field);
        state.field = next.field;
      }
      if (next.preset !== undefined) {
        state.preset = next.preset;
      }
      if (next.particleCount !== undefined) {
        validatePositiveFinite(next.particleCount, 'particleCount');
        state.particleCount = next.particleCount;
      }
      if (next.lineWidth !== undefined) {
        validatePositiveFinite(next.lineWidth, 'lineWidth');
        state.lineWidth = next.lineWidth;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
      }
      if (next.fadeOpacity !== undefined) {
        validateNonNegativeFinite(next.fadeOpacity, 'fadeOpacity');
        state.fadeOpacity = next.fadeOpacity;
      }
      if (next.palette !== undefined) {
        state.palette = next.palette;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = Math.min(1, next.opacity);
        material.uniforms.u_opacity = state.opacity;
      }

      engine?.updateConfig({
        preset: state.preset,
        field: state.field,
        particleCount: state.particleCount,
        lineWidth: state.lineWidth,
        speed: state.speed,
        fadeOpacity: state.fadeOpacity,
        palette: state.palette,
      });

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
          state.clampToGround ? buildGroundPrimitive() : buildFlatPrimitive(state.height),
        );
      } else if (heightChanged && !state.clampToGround) {
        swapPrimitive(false, buildFlatPrimitive(state.height));
      }
    },
    onRestart() {
      prevElapsed = 0;
      engine?.clear();
      presentFrame();
    },
    onDestroy() {
      engine?.destroy();
    },
  });

  return {
    ...baseHandle,
    clear() {
      if (baseHandle.isDestroyed()) return;
      engine?.clear();
      presentFrame();
    },
  };
}
