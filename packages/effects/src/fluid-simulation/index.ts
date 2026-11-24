import {
  BlendingState,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  Material,
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
import {
  resolveColor,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';
import { NavierStokesSolver } from './solver.ts';

export type GeographicBounds = readonly [west: number, south: number, east: number, north: number];

export interface FluidSimulationOptions extends EffectBaseOptions {
  /** Geographic rectangle [west, south, east, north] in degrees where the fluid simulation runs. */
  bounds: GeographicBounds;
  /** Altitude of the fluid layer above the ellipsoid in metres. Defaults to 2_500. */
  height?: number;
  /** Simulation velocity grid resolution (height in texels). Defaults to 160. */
  resolution?: number;
  /** Vorticity confinement strength (0 to 60). Higher values produce tighter swirling vortices. Defaults to 32. */
  curl?: number;
  /** Velocity viscous damping rate. Defaults to 0.25. */
  velocityDissipation?: number;
  /** Dye fade rate. Defaults to 0.85. */
  dyeDissipation?: number;
  /** Normalized splat radius for emitters and manual splats. Defaults to 0.0045. */
  splatRadius?: number;
  /** Simulation time step speed multiplier. Defaults to 1. */
  speed?: number;
  /** Overall layer opacity multiplier. Defaults to 0.92. */
  opacity?: number;
  /** Primary emitter color (Cesium Color or CSS string). Defaults to '#00d4ff'. */
  primaryColor?: ColorInput;
  /** Secondary emitter color (Cesium Color or CSS string). Defaults to '#ff6b35'. */
  secondaryColor?: ColorInput;
  /** Automatically drive counter-orbiting vortex emitters so the fluid flows continuously. Defaults to true. */
  autoEmit?: boolean;
}

export type FluidSimulationUpdateOptions = Pick<
  FluidSimulationOptions,
  | 'curl'
  | 'velocityDissipation'
  | 'dyeDissipation'
  | 'splatRadius'
  | 'speed'
  | 'opacity'
  | 'primaryColor'
  | 'secondaryColor'
  | 'autoEmit'
>;

export interface FluidSimulationHandle extends EffectHandle<FluidSimulationUpdateOptions> {
  /** Injects a velocity impulse and dye splat at a geographic [lng, lat] inside `bounds`. */
  splat(position: LngLat, velocity: readonly [number, number], color?: ColorInput): void;
  /** Clears all velocity, pressure, and dye buffers immediately. */
  clear(): void;
}

const DEFAULT_PRIMARY = Color.fromCssColorString('#00d4ff');
const DEFAULT_SECONDARY = Color.fromCssColorString('#ff6b35');

const FLUID_SURFACE_SHADER = /* glsl */ `
uniform sampler2D u_fluid;
uniform float u_opacity;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 sampleTex = texture(u_fluid, materialInput.st);
  material.diffuse = vec3(0.0);
  material.emission = sampleTex.rgb;
  material.alpha = clamp(sampleTex.a * u_opacity, 0.0, 0.96);
  return material;
}
`;

function validateBounds(bounds: GeographicBounds): void {
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

function createPresentCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

/**
 * Adds a real-time WebGL2 Ping-Pong FBO 2D Navier-Stokes incompressible fluid simulation
 * mapped onto a geographic rectangle on the Cesium globe.
 * Supports vorticity confinement, automatic vortex emitters, and live `splat()` interaction.
 */
export function createFluidSimulation(
  viewer: Viewer,
  options: FluidSimulationOptions,
): FluidSimulationHandle {
  validateBounds(options.bounds);
  const [west, south, east, north] = options.bounds;

  const height = options.height ?? 2_500;
  const resolution = options.resolution ?? 160;
  if (!Number.isFinite(height)) {
    throw new RangeError('Expected height to be a finite number.');
  }
  validatePositiveFinite(resolution, 'resolution');

  const state = {
    curl: options.curl ?? 32,
    velocityDissipation: options.velocityDissipation ?? 0.25,
    dyeDissipation: options.dyeDissipation ?? 0.85,
    splatRadius: options.splatRadius ?? 0.0045,
    speed: options.speed ?? 1,
    opacity: options.opacity ?? 0.92,
    primaryColor: resolveColor(options.primaryColor, DEFAULT_PRIMARY),
    secondaryColor: resolveColor(options.secondaryColor, DEFAULT_SECONDARY),
    autoEmit: options.autoEmit ?? true,
  };

  validateNonNegativeFinite(state.curl, 'curl');
  validateNonNegativeFinite(state.velocityDissipation, 'velocityDissipation');
  validateNonNegativeFinite(state.dyeDissipation, 'dyeDissipation');
  validatePositiveFinite(state.splatRadius, 'splatRadius');
  validateNonNegativeFinite(state.speed, 'speed');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const midLatRad = ((south + north) * 0.5 * Math.PI) / 180;
  const aspect = ((east - west) * Math.max(0.2, Math.cos(midLatRad))) / (north - south);
  const solver = NavierStokesSolver.create(resolution, aspect);

  // Alternate between two 2D presentation canvases so Cesium Material uploads each new frame cleanly
  // via pure public API without touching private Cesium internals.
  const presentPair = solver
    ? [
        createPresentCanvas(solver.canvas.width, solver.canvas.height),
        createPresentCanvas(solver.canvas.width, solver.canvas.height),
      ]
    : null;
  let frameIndex = 0;

  // Always pass a cloneable string (Material.DefaultImageId) into fabric.uniforms so Cesium's
  // internal Material cache never stores an HTMLCanvasElement (whose constructor cannot be cloned
  // on subsequent mounts). Assign the live canvas onto material.uniforms after construction.
  const material = new Material({
    fabric: {
      type: 'CesiumlabFluidSimulation',
      uniforms: {
        u_fluid: Material.DefaultImageId,
        u_opacity: state.opacity,
      },
      source: FLUID_SURFACE_SHADER,
    },
    translucent: true,
  });

  if (presentPair?.[0]?.canvas) {
    material.uniforms.u_fluid = presentPair[0].canvas;
  }

  const primitive = new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: new RectangleGeometry({
        rectangle: Rectangle.fromDegrees(west, south, east, north),
        height,
        ellipsoid: viewer.scene.ellipsoid,
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

  viewer.scene.primitives.add(primitive);

  const presentFrame = () => {
    if (!solver || !presentPair) return;
    frameIndex = (frameIndex + 1) & 1;
    const slot = presentPair[frameIndex];
    if (!slot?.ctx) return;
    slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
    slot.ctx.drawImage(solver.canvas, 0, 0);
    material.uniforms.u_fluid = slot.canvas;
  };

  let prevTime = 0;

  const emitAutoVortices = (elapsedSeconds: number) => {
    if (!solver || !state.autoEmit) return;
    const t = elapsedSeconds * state.speed;

    // Two counter-orbiting jets colliding across the basin to generate swirling vortices.
    const a1 = t * 0.72;
    const u1 = 0.5 + Math.cos(a1) * 0.24;
    const v1 = 0.5 + Math.sin(a1) * 0.24;
    const vx1 = -Math.sin(a1) * 420 + Math.cos(a1 * 2.1) * 140;
    const vy1 = Math.cos(a1) * 420 + Math.sin(a1 * 2.1) * 140;

    const a2 = a1 + Math.PI;
    const u2 = 0.5 + Math.cos(a2) * 0.24;
    const v2 = 0.5 + Math.sin(a2) * 0.24;
    const vx2 = -Math.sin(a2) * 420 - Math.cos(a2 * 1.9) * 140;
    const vy2 = Math.cos(a2) * 420 - Math.sin(a2 * 1.9) * 140;

    solver.splat(
      u1,
      v1,
      vx1,
      vy1,
      [
        state.primaryColor.red * 0.55,
        state.primaryColor.green * 0.55,
        state.primaryColor.blue * 0.55,
      ],
      state.splatRadius,
    );
    solver.splat(
      u2,
      v2,
      vx2,
      vy2,
      [
        state.secondaryColor.red * 0.55,
        state.secondaryColor.green * 0.55,
        state.secondaryColor.blue * 0.55,
      ],
      state.splatRadius,
    );
  };

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    if (!solver) return;
    const dt = Math.min(0.033, Math.max(0.004, (elapsedSeconds - prevTime) * state.speed));
    prevTime = elapsedSeconds;

    emitAutoVortices(elapsedSeconds);
    solver.step(dt, {
      curl: state.curl,
      velocityDissipation: state.velocityDissipation,
      dyeDissipation: state.dyeDissipation,
      splatRadius: state.splatRadius,
      pressureIterations: 16,
    });
    presentFrame();
  });

  const baseHandle = createPrimitiveEffectHandle<FluidSimulationUpdateOptions>({
    viewer,
    clock,
    initialShow: options.show,
    getPrimitives: () => [primitive],
    onUpdate(next) {
      if (next.curl !== undefined) {
        validateNonNegativeFinite(next.curl, 'curl');
        state.curl = next.curl;
      }
      if (next.velocityDissipation !== undefined) {
        validateNonNegativeFinite(next.velocityDissipation, 'velocityDissipation');
        state.velocityDissipation = next.velocityDissipation;
      }
      if (next.dyeDissipation !== undefined) {
        validateNonNegativeFinite(next.dyeDissipation, 'dyeDissipation');
        state.dyeDissipation = next.dyeDissipation;
      }
      if (next.splatRadius !== undefined) {
        validatePositiveFinite(next.splatRadius, 'splatRadius');
        state.splatRadius = next.splatRadius;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
        material.uniforms.u_opacity = state.opacity;
      }
      if (next.primaryColor !== undefined) {
        state.primaryColor = resolveColor(next.primaryColor, DEFAULT_PRIMARY);
      }
      if (next.secondaryColor !== undefined) {
        state.secondaryColor = resolveColor(next.secondaryColor, DEFAULT_SECONDARY);
      }
      if (next.autoEmit !== undefined) {
        state.autoEmit = next.autoEmit;
      }
    },
    onRestart() {
      prevTime = 0;
      solver?.clear();
      presentFrame();
    },
    onDestroy() {
      solver?.destroy();
    },
  });

  return {
    ...baseHandle,
    splat(position, velocity, colorInput) {
      if (baseHandle.isDestroyed() || !solver) return;
      const [lng, lat] = position;
      const u = (lng - west) / (east - west);
      const v = (lat - south) / (north - south);
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      const dyeColor = resolveColor(colorInput, state.primaryColor);
      solver.splat(
        u,
        v,
        velocity[0],
        velocity[1],
        [dyeColor.red * 0.9, dyeColor.green * 0.9, dyeColor.blue * 0.9],
        state.splatRadius * 1.35,
      );
      presentFrame();
    },
    clear() {
      if (baseHandle.isDestroyed() || !solver) return;
      solver.clear();
      presentFrame();
    },
  };
}
