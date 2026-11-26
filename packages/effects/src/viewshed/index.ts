import {
  BlendingState,
  BoundingSphere,
  Camera,
  Cartesian3,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  PerInstanceColorAppearance,
  PerspectiveFrustum,
  PostProcessStage,
  Primitive,
  PrimitiveType,
  ShadowMap,
  Transforms,
  type Viewer,
} from '@cesiumlab/cesium';
import { createAnimationClock } from '../shared/clock.ts';
import type { EffectBaseOptions, EffectHandle } from '../shared/effect.ts';
import {
  resolveColor,
  validateLngLat,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
  type LngLat,
} from '../shared/geo.ts';

export interface ViewshedOptions extends EffectBaseOptions {
  /** Observer geographic position `[longitude, latitude]` in degrees. */
  observer: LngLat;
  /** Observer altitude in metres above the ellipsoid. Defaults to 120. */
  observerHeight?: number;
  /** Viewing azimuth heading in degrees (0 = North, 90 = East). Defaults to 0. */
  heading?: number;
  /** Viewing pitch angle in degrees (negative looks downward, e.g. -18). Defaults to -18. */
  pitch?: number;
  /** Horizontal field of view in degrees (10 to 150). Defaults to 75. */
  horizontalFov?: number;
  /** Vertical field of view in degrees (10 to 120). Defaults to 48. */
  verticalFov?: number;
  /** Maximum analysis distance in metres. Defaults to 3_500. */
  distance?: number;
  /** Color projected onto terrain & 3D buildings visible from the observer. Defaults to '#00e5a0'. */
  visibleColor?: ColorInput;
  /** Color projected onto occluded blind spots behind ridges & buildings. Defaults to '#ff3b5c'. */
  hiddenColor?: ColorInput;
  /** Overlay opacity (0.1 to 1). Defaults to 0.58. */
  opacity?: number;
  /** Render the 3D sensor frustum wireframe lines from the observer. Defaults to true. */
  showFrustum?: boolean;
  /** Automatically sweep heading back and forth like a surveillance sensor. Defaults to false. */
  autoSweep?: boolean;
  /** Oscillation speed multiplier when `autoSweep` is true. Defaults to 0.6. */
  sweepSpeed?: number;
  /** Half-angle sweep range in degrees when `autoSweep` is true. Defaults to 35. */
  sweepRange?: number;
  /** Off-screen shadow map resolution (512, 1024, or 2048). Defaults to 1024. */
  shadowMapSize?: number;
}

export type ViewshedUpdateOptions = Partial<
  Pick<
    ViewshedOptions,
    | 'observer'
    | 'observerHeight'
    | 'heading'
    | 'pitch'
    | 'horizontalFov'
    | 'verticalFov'
    | 'distance'
    | 'visibleColor'
    | 'hiddenColor'
    | 'opacity'
    | 'showFrustum'
    | 'autoSweep'
    | 'sweepSpeed'
    | 'sweepRange'
  >
>;

export type ViewshedHandle = EffectHandle<ViewshedUpdateOptions>;

const DEFAULT_VISIBLE_COLOR = Color.fromCssColorString('#00e5a0');
const DEFAULT_HIDDEN_COLOR = Color.fromCssColorString('#ff3b5c');

const VIEWSHED_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
uniform sampler2D u_shadowMapTexture;

uniform mat4 u_shadowMapMatrix;
uniform vec3 u_observerEC;
uniform float u_distance;
uniform float u_opacity;
uniform float u_usesDepthTexture;
uniform float u_ready;
uniform vec4 u_visibleColor;
uniform vec4 u_hiddenColor;

in vec2 v_textureCoordinates;

void main(void) {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  if (u_ready < 0.5 || u_opacity <= 0.001) {
    out_FragColor = sceneColor;
    return;
  }

  float rawDepth = czm_readDepth(depthTexture, v_textureCoordinates);
  if (rawDepth >= 0.999995) {
    out_FragColor = sceneColor;
    return;
  }

  vec4 eyePos = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
  eyePos /= eyePos.w;

  float dist = length(eyePos.xyz - u_observerEC);
  if (dist > u_distance || dist < 1.0) {
    out_FragColor = sceneColor;
    return;
  }

  vec4 shadowPos = u_shadowMapMatrix * eyePos;
  if (shadowPos.w <= 0.0) {
    out_FragColor = sceneColor;
    return;
  }
  shadowPos /= shadowPos.w;

  if (
    shadowPos.x < 0.0 ||
    shadowPos.x > 1.0 ||
    shadowPos.y < 0.0 ||
    shadowPos.y > 1.0 ||
    shadowPos.z < 0.0 ||
    shadowPos.z > 1.0
  ) {
    out_FragColor = sceneColor;
    return;
  }

  float shadowDepth = u_usesDepthTexture > 0.5
    ? texture(u_shadowMapTexture, shadowPos.xy).r
    : czm_unpackDepth(texture(u_shadowMapTexture, shadowPos.xy));

  // Adaptive depth bias prevents self-shadowing acne on sloped terrain & building facades.
  float bias = 0.00045;
  float visFactor = (shadowPos.z - bias) <= shadowDepth ? 1.0 : 0.0;

  // Crisp frustum border frame & subtle range-ring ticks
  float edgeDist = min(min(shadowPos.x, 1.0 - shadowPos.x), min(shadowPos.y, 1.0 - shadowPos.y));
  float border = 1.0 - smoothstep(0.0, 0.012, edgeDist);
  float distNorm = dist / max(1.0, u_distance);
  float rangeFade = 1.0 - smoothstep(0.92, 1.0, distNorm);
  float ring = 1.0 - smoothstep(0.0, 0.018, abs(fract(distNorm * 4.0) - 0.5));

  vec3 tint = mix(u_hiddenColor.rgb, u_visibleColor.rgb, visFactor);
  float alpha = clamp((u_opacity * (0.62 + 0.25 * visFactor) + border * 0.45 + ring * 0.14) * rangeFade, 0.0, 0.92);
  vec3 overlayRgb = mix(tint, vec3(1.0), border * 0.42 + ring * 0.12);

  vec3 finalRgb = mix(sceneColor.rgb, overlayRgb, alpha);
  out_FragColor = vec4(finalRgb, sceneColor.a);
}
`;

/**
 * Builds a unit wireframe frustum geometry in camera-local space:
 * origin at (0, 0, 0), looking down +X with +Y right and +Z up,
 * scaled dynamically via `modelMatrix` as FOV/distance/orientation change.
 */
function buildFrustumWireframeGeometry(
  hFovRad: number,
  vFovRad: number,
  distance: number,
): Geometry {
  const halfW = Math.tan(hFovRad * 0.5) * distance;
  const halfH = Math.tan(vFovRad * 0.5) * distance;

  // 5 vertices: apex (0) + 4 far corners (1..4)
  // Camera local frame: +Z = forward (direction), +X = right, +Y = up
  const pts = [
    [0, 0, 0],
    [-halfW, halfH, distance], // top-left
    [halfW, halfH, distance], // top-right
    [halfW, -halfH, distance], // bottom-right
    [-halfW, -halfH, distance], // bottom-left
  ];

  // 8 line segments = 4 pyramid edges + 4 far-plane frame edges
  const segs: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 1],
  ];

  const positions = new Float64Array(segs.length * 2 * 3);
  const colors = new Uint8Array(segs.length * 2 * 4);
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i]!;
    const pa = pts[a]!;
    const pb = pts[b]!;
    const pOff = i * 6;
    positions[pOff] = pa[0]!;
    positions[pOff + 1] = pa[1]!;
    positions[pOff + 2] = pa[2]!;
    positions[pOff + 3] = pb[0]!;
    positions[pOff + 4] = pb[1]!;
    positions[pOff + 5] = pb[2]!;

    const cOff = i * 8;
    // Bright cyan-white wireframe lines
    colors[cOff] = 160;
    colors[cOff + 1] = 245;
    colors[cOff + 2] = 255;
    colors[cOff + 3] = 215;
    colors[cOff + 4] = 160;
    colors[cOff + 5] = 245;
    colors[cOff + 6] = 255;
    colors[cOff + 7] = 175;
  }

  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: positions,
  });
  attributes.color = new GeometryAttribute({
    componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
    componentsPerAttribute: 4,
    normalize: true,
    values: colors,
  });

  return new Geometry({
    attributes,
    primitiveType: PrimitiveType.LINES,
    boundingSphere: BoundingSphere.fromVertices(positions as unknown as number[]),
  });
}

interface InternalShadowMap {
  _shadowMapTexture?: unknown;
  _shadowMapMatrix?: Matrix4;
  _usesDepthTexture?: boolean;
  enabled: boolean;
  maximumDistance: number;
  isDestroyed?: () => boolean;
  destroy?: () => void;
}

/**
 * Performs real-time GPU 3D viewshed / line-of-sight analysis from an observer vantage point
 * using an off-screen `ShadowMap` depth pass and a `PostProcessStage` projection shader,
 * projecting visible (green) and occluded blind-spot (red) zones onto terrain and 3D buildings.
 */
export function createViewshed(viewer: Viewer, options: ViewshedOptions): ViewshedHandle {
  validateLngLat(options.observer, 'observer');

  const state = {
    observer: options.observer,
    observerHeight: options.observerHeight ?? 120,
    heading: options.heading ?? 0,
    pitch: options.pitch ?? -18,
    horizontalFov: options.horizontalFov ?? 75,
    verticalFov: options.verticalFov ?? 48,
    distance: options.distance ?? 3_500,
    visibleColor: resolveColor(options.visibleColor, DEFAULT_VISIBLE_COLOR),
    hiddenColor: resolveColor(options.hiddenColor, DEFAULT_HIDDEN_COLOR),
    opacity: options.opacity ?? 0.58,
    showFrustum: options.showFrustum ?? true,
    autoSweep: options.autoSweep ?? false,
    sweepSpeed: options.sweepSpeed ?? 0.6,
    sweepRange: options.sweepRange ?? 35,
    shadowMapSize: options.shadowMapSize ?? 1024,
    time: 0,
  };

  if (!Number.isFinite(state.observerHeight)) {
    throw new RangeError('Expected observerHeight to be a finite number.');
  }
  if (!Number.isFinite(state.heading) || !Number.isFinite(state.pitch)) {
    throw new RangeError('Expected heading and pitch to be finite numbers.');
  }
  validatePositiveFinite(state.horizontalFov, 'horizontalFov');
  validatePositiveFinite(state.verticalFov, 'verticalFov');
  validatePositiveFinite(state.distance, 'distance');
  validateNonNegativeFinite(state.opacity, 'opacity');
  validateNonNegativeFinite(state.sweepSpeed, 'sweepSpeed');
  validateNonNegativeFinite(state.sweepRange, 'sweepRange');
  validatePositiveFinite(state.shadowMapSize, 'shadowMapSize');

  const scene = viewer.scene as unknown as {
    context?: unknown;
    frameState?: { shadowMaps?: unknown[] };
    globe?: { ellipsoid?: any };
    primitives: { add: (p: any) => any; remove: (p: any) => any };
    postProcessStages: { add: (s: any) => any; remove: (s: any) => any };
  };

  const observerECEF = new Cartesian3();
  const observerEC = new Cartesian3();
  const frustumModelMatrix = new Matrix4();
  const rotMatrixScratch = new Matrix3();
  const identityMatrix = Matrix4.clone(Matrix4.IDENTITY);

  // Create off-screen observer camera & ShadowMap when running in a real WebGL Cesium Scene
  let observerCamera: Camera | null = null;
  let shadowMap: InternalShadowMap | null = null;

  if (scene.context) {
    observerCamera = new Camera(viewer.scene);
    observerCamera.frustum = new PerspectiveFrustum({
      fov: CesiumMath.toRadians(Math.max(state.horizontalFov, state.verticalFov)),
      aspectRatio:
        Math.tan(CesiumMath.toRadians(state.horizontalFov * 0.5)) /
        Math.max(1e-4, Math.tan(CesiumMath.toRadians(state.verticalFov * 0.5))),
      near: Math.max(1, state.distance * 0.002),
      far: state.distance,
    });
    shadowMap = new (ShadowMap as unknown as new (
      opts: Record<string, unknown>,
    ) => InternalShadowMap)({
      context: scene.context,
      lightCamera: observerCamera,
      enabled: true,
      isPointLight: false,
      cascadingEnabled: false,
      softShadows: false,
      fromLightSource: false,
      size: state.shadowMapSize,
      maximumDistance: state.distance,
    });
  }

  let visible = options.show ?? true;
  let destroyed = false;

  const computeActiveHeadingDeg = (): number => {
    if (!state.autoSweep || state.sweepRange <= 0) {
      return state.heading;
    }
    return state.heading + Math.sin(state.time * state.sweepSpeed) * state.sweepRange;
  };

  const syncObserverCameraAndFrustum = () => {
    const ellipsoid = scene.globe?.ellipsoid;
    Cartesian3.fromDegrees(
      state.observer[0],
      state.observer[1],
      state.observerHeight,
      ellipsoid,
      observerECEF,
    );

    const activeHeadingRad = CesiumMath.toRadians(computeActiveHeadingDeg());
    const pitchRad = CesiumMath.toRadians(Math.max(-89, Math.min(89, state.pitch)));

    if (observerCamera) {
      const hFovRad = CesiumMath.toRadians(Math.max(10, Math.min(150, state.horizontalFov)));
      const vFovRad = CesiumMath.toRadians(Math.max(10, Math.min(120, state.verticalFov)));
      const frustum = observerCamera.frustum as PerspectiveFrustum;
      frustum.aspectRatio = Math.tan(hFovRad * 0.5) / Math.max(1e-4, Math.tan(vFovRad * 0.5));
      frustum.fov = Math.max(hFovRad, vFovRad);
      frustum.near = Math.max(1, state.distance * 0.002);
      frustum.far = state.distance;

      observerCamera.setView({
        destination: observerECEF,
        orientation: {
          heading: activeHeadingRad,
          pitch: pitchRad,
          roll: 0,
        },
      });

      // Build frustum wireframe modelMatrix directly from observerCamera basis:
      // col 0 = right, col 1 = up, col 2 = direction, col 3 = observerECEF
      Matrix3.setColumn(rotMatrixScratch, 0, observerCamera.rightWC, rotMatrixScratch);
      Matrix3.setColumn(rotMatrixScratch, 1, observerCamera.upWC, rotMatrixScratch);
      Matrix3.setColumn(rotMatrixScratch, 2, observerCamera.directionWC, rotMatrixScratch);
      Matrix4.fromRotationTranslation(rotMatrixScratch, observerECEF, frustumModelMatrix);
    } else {
      Transforms.eastNorthUpToFixedFrame(observerECEF, ellipsoid, frustumModelMatrix);
    }

    if (shadowMap) {
      shadowMap.maximumDistance = state.distance;
      shadowMap.enabled = visible;
    }

    if (frustumPrimitive) {
      Matrix4.clone(frustumModelMatrix, frustumPrimitive.modelMatrix);
      frustumPrimitive.show = visible && state.showFrustum;
    }
  };

  const buildFrustumPrimitive = (): Primitive => {
    const hFovRad = CesiumMath.toRadians(Math.max(10, Math.min(150, state.horizontalFov)));
    const vFovRad = CesiumMath.toRadians(Math.max(10, Math.min(120, state.verticalFov)));
    const p = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: buildFrustumWireframeGeometry(hFovRad, vFovRad, state.distance),
      }),
      modelMatrix: Matrix4.clone(frustumModelMatrix),
      appearance: new PerInstanceColorAppearance({
        flat: true,
        translucent: true,
        renderState: {
          depthTest: { enabled: true },
          depthMask: false,
          blending: BlendingState.ALPHA_BLEND,
        },
      }),
      asynchronous: false,
      allowPicking: false,
    });
    p.show = visible && state.showFrustum;
    return p;
  };

  let frustumPrimitive: Primitive | null = null;
  syncObserverCameraAndFrustum();
  frustumPrimitive = buildFrustumPrimitive();
  scene.primitives.add(frustumPrimitive);

  // Fallback 1x1 texture placeholder not needed because shader checks u_ready before sampling.
  const stage = new PostProcessStage({
    fragmentShader: VIEWSHED_FRAGMENT_SHADER,
    uniforms: {
      u_shadowMapTexture: () =>
        shadowMap?._shadowMapTexture ??
        (scene.context as { defaultTexture?: unknown } | undefined)?.defaultTexture,
      u_shadowMapMatrix: () => shadowMap?._shadowMapMatrix ?? identityMatrix,
      u_observerEC: () => {
        const viewMatrix = viewer.camera?.viewMatrix;
        if (viewMatrix) {
          Matrix4.multiplyByPoint(viewMatrix, observerECEF, observerEC);
        }
        return observerEC;
      },
      u_distance: () => state.distance,
      u_opacity: () => state.opacity,
      u_usesDepthTexture: () => (shadowMap?._usesDepthTexture ? 1 : 0),
      u_ready: () => (shadowMap?._shadowMapTexture ? 1 : 0),
      u_visibleColor: () => state.visibleColor,
      u_hiddenColor: () => state.hiddenColor,
    },
  });
  stage.enabled = visible;
  scene.postProcessStages.add(stage);

  // Register our off-screen analytical ShadowMap on every preRender so Cesium renders the
  // observer depth buffer before PostProcessStages execute (without casting sun shadows).
  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    state.time = elapsedSeconds;
    syncObserverCameraAndFrustum();
    if (visible && shadowMap && scene.frameState?.shadowMaps) {
      scene.frameState.shadowMaps.push(shadowMap);
    }
  });

  const rebuildFrustum = () => {
    if (viewer.isDestroyed()) return;
    if (frustumPrimitive) {
      scene.primitives.remove(frustumPrimitive);
    }
    syncObserverCameraAndFrustum();
    frustumPrimitive = buildFrustumPrimitive();
    scene.primitives.add(frustumPrimitive);
  };

  const setVisible = (nextVisible: boolean) => {
    if (destroyed) return;
    visible = nextVisible;
    stage.enabled = visible;
    if (shadowMap) {
      shadowMap.enabled = visible;
    }
    if (frustumPrimitive) {
      frustumPrimitive.show = visible && state.showFrustum;
    }
  };

  return {
    show() {
      setVisible(true);
    },
    hide() {
      setVisible(false);
    },
    setVisible,
    isVisible() {
      return !destroyed && visible;
    },
    update(next) {
      if (destroyed) return;
      let frustumGeomDirty = false;
      let cameraDirty = false;

      if (next.observer !== undefined) {
        validateLngLat(next.observer, 'observer');
        state.observer = next.observer;
        cameraDirty = true;
      }
      if (next.observerHeight !== undefined) {
        if (!Number.isFinite(next.observerHeight)) {
          throw new RangeError('Expected observerHeight to be a finite number.');
        }
        state.observerHeight = next.observerHeight;
        cameraDirty = true;
      }
      if (next.heading !== undefined) {
        if (!Number.isFinite(next.heading)) {
          throw new RangeError('Expected heading to be a finite number.');
        }
        state.heading = next.heading;
        cameraDirty = true;
      }
      if (next.pitch !== undefined) {
        if (!Number.isFinite(next.pitch)) {
          throw new RangeError('Expected pitch to be a finite number.');
        }
        state.pitch = next.pitch;
        cameraDirty = true;
      }
      if (next.horizontalFov !== undefined && next.horizontalFov !== state.horizontalFov) {
        validatePositiveFinite(next.horizontalFov, 'horizontalFov');
        state.horizontalFov = next.horizontalFov;
        frustumGeomDirty = true;
      }
      if (next.verticalFov !== undefined && next.verticalFov !== state.verticalFov) {
        validatePositiveFinite(next.verticalFov, 'verticalFov');
        state.verticalFov = next.verticalFov;
        frustumGeomDirty = true;
      }
      if (next.distance !== undefined && next.distance !== state.distance) {
        validatePositiveFinite(next.distance, 'distance');
        state.distance = next.distance;
        frustumGeomDirty = true;
      }
      if (next.visibleColor !== undefined) {
        state.visibleColor = resolveColor(next.visibleColor, DEFAULT_VISIBLE_COLOR);
      }
      if (next.hiddenColor !== undefined) {
        state.hiddenColor = resolveColor(next.hiddenColor, DEFAULT_HIDDEN_COLOR);
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = next.opacity;
      }
      if (next.showFrustum !== undefined) {
        state.showFrustum = next.showFrustum;
        if (frustumPrimitive) {
          frustumPrimitive.show = visible && state.showFrustum;
        }
      }
      if (next.autoSweep !== undefined) {
        state.autoSweep = next.autoSweep;
        cameraDirty = true;
      }
      if (next.sweepSpeed !== undefined) {
        validateNonNegativeFinite(next.sweepSpeed, 'sweepSpeed');
        state.sweepSpeed = next.sweepSpeed;
      }
      if (next.sweepRange !== undefined) {
        validateNonNegativeFinite(next.sweepRange, 'sweepRange');
        state.sweepRange = next.sweepRange;
        cameraDirty = true;
      }

      if (frustumGeomDirty) {
        rebuildFrustum();
      } else if (cameraDirty) {
        syncObserverCameraAndFrustum();
      }
    },
    setPaused(paused) {
      if (destroyed) return;
      clock.setPaused(paused);
    },
    isPaused() {
      return clock.isPaused();
    },
    restart() {
      if (destroyed) return;
      clock.restart();
      state.time = 0;
      syncObserverCameraAndFrustum();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clock.destroy();
      if (!viewer.isDestroyed()) {
        scene.postProcessStages.remove(stage);
        if (frustumPrimitive) {
          scene.primitives.remove(frustumPrimitive);
          frustumPrimitive = null;
        }
      }
      if (shadowMap && !shadowMap.isDestroyed?.()) {
        shadowMap.destroy?.();
      }
      shadowMap = null;
    },
    isDestroyed() {
      return destroyed;
    },
  };
}
