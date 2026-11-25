import { Color, Material, type Viewer } from 'cesium';
import type { EffectBaseOptions, EffectHandle } from '../shared/effect.ts';
import {
  resolveColor,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
} from '../shared/geo.ts';

export type TerrainAnalysisMode = 'contour' | 'elevation' | 'slope' | 'aspect';

export interface TerrainAnalysisOptions extends EffectBaseOptions {
  /** Analysis shading mode (`'contour' | 'elevation' | 'slope' | 'aspect'`). Defaults to `'elevation'`. */
  mode?: TerrainAnalysisMode;
  /** Vertical elevation interval between minor contour lines in metres. Defaults to 200. */
  contourSpacing?: number;
  /** Screen-space contour line width multiplier (0.5 to 4). Defaults to 1.4. */
  contourWidth?: number;
  /** Color of contour lines (CSS string or Cesium `Color`). Defaults to `'#f8fafc'`. */
  contourColor?: ColorInput;
  /** Overlay anti-aliased major & minor contour lines in shaded modes (`elevation`, `slope`, `aspect`). Defaults to `true`. */
  showContours?: boolean;
  /** Minimum elevation in metres mapped to the bottom of the elevation ramp. Defaults to 1_000. */
  minElevation?: number;
  /** Maximum elevation in metres mapped to the top of the elevation ramp. Defaults to 6_500. */
  maxElevation?: number;
  /** Maximum slope angle in degrees mapped to the top of the slope hazard ramp. Defaults to 60. */
  maxSlopeDegrees?: number;
  /** Opacity of the shaded relief / slope / aspect overlay (0 to 1). Defaults to 0.72. */
  opacity?: number;
}

export type TerrainAnalysisUpdateOptions = Partial<
  Pick<
    TerrainAnalysisOptions,
    | 'mode'
    | 'contourSpacing'
    | 'contourWidth'
    | 'contourColor'
    | 'showContours'
    | 'minElevation'
    | 'maxElevation'
    | 'maxSlopeDegrees'
    | 'opacity'
  >
>;

export type TerrainAnalysisHandle = EffectHandle<TerrainAnalysisUpdateOptions>;

const MODE_INDEX: Record<TerrainAnalysisMode, number> = {
  contour: 0,
  elevation: 1,
  slope: 2,
  aspect: 3,
};

const TERRAIN_ANALYSIS_SHADER = /* glsl */ `
uniform float u_mode;
uniform float u_contourSpacing;
uniform float u_contourWidth;
uniform vec4 u_contourColor;
uniform float u_showContours;
uniform float u_minElevation;
uniform float u_maxElevation;
uniform float u_maxSlopeRad;
uniform float u_opacity;

vec3 ramp5(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  return mix(c3, c4, x - 3.0);
}

vec3 elevationColor(float height) {
  float denom = max(u_maxElevation - u_minElevation, 1.0);
  float t = clamp((height - u_minElevation) / denom, 0.0, 1.0);
  return ramp5(
    t,
    vec3(0.08, 0.36, 0.24),
    vec3(0.32, 0.68, 0.36),
    vec3(0.95, 0.78, 0.32),
    vec3(0.79, 0.38, 0.22),
    vec3(0.96, 0.98, 1.0)
  );
}

vec3 slopeColor(float slopeRad) {
  // Guard against Cesium GlobeVS acos(dotProd > 1.0) floating-point NaN on flat vertices
  float safeSlope = (isnan(slopeRad) || isinf(slopeRad)) ? 0.0 : clamp(slopeRad, 0.0, czm_pi * 0.5);
  float t = clamp(safeSlope / max(u_maxSlopeRad, 0.087), 0.0, 1.0);
  return ramp5(
    t,
    vec3(0.09, 0.64, 0.35),
    vec3(0.56, 0.82, 0.18),
    vec3(0.96, 0.65, 0.08),
    vec3(0.92, 0.34, 0.08),
    vec3(0.84, 0.12, 0.18)
  );
}

vec3 aspectColor(float aspectRad, float slopeRad) {
  vec3 flatSlate = vec3(0.38, 0.42, 0.48);
  float safeSlope = (isnan(slopeRad) || isinf(slopeRad)) ? 0.0 : clamp(slopeRad, 0.0, czm_pi * 0.5);
  // Guard against Cesium GlobeVS normalize(vec3(0.0)) / acos(>1.0) NaN on flat or exact-East vertices
  if (isnan(aspectRad) || isinf(aspectRad)) {
    return safeSlope < 0.02 ? flatSlate : vec3(0.22, 0.74, 0.97);
  }
  // Cyclic 360-degree directional palette: N cyan -> E gold -> S coral -> W violet -> N cyan
  float t = fract(aspectRad / (2.0 * czm_pi));
  vec3 dirRgb = ramp5(
    t,
    vec3(0.22, 0.74, 0.97),
    vec3(0.98, 0.76, 0.20),
    vec3(0.98, 0.44, 0.52),
    vec3(0.66, 0.36, 0.96),
    vec3(0.22, 0.74, 0.97)
  );
  // Attenuate flat ground (< ~2.5 deg) toward neutral slate to avoid noisy aspect jitter
  float flatMask = smoothstep(0.015, 0.06, safeSlope);
  return mix(flatSlate, dirRgb, flatMask);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  float h = materialInput.height;
  float spacing = max(u_contourSpacing, 1.0);

#if (__VERSION__ == 300 || defined(GL_OES_standard_derivatives))
  float dF = max(max(abs(dFdx(h)), abs(dFdy(h))), 1e-4) * max(czm_pixelRatio, 1.0);
#else
  float dF = max(czm_pixelRatio, 1.0);
#endif

  // Symmetric distance to nearest minor contour and 5x major index contour
  float minorDist = abs(fract(h / spacing + 0.5) - 0.5) * spacing;
  float minorLine = 1.0 - smoothstep(
    dF * (u_contourWidth * 0.42),
    dF * (u_contourWidth * 0.95 + 0.55),
    minorDist
  );

  float majorSpacing = spacing * 5.0;
  float majorDist = abs(fract(h / majorSpacing + 0.5) - 0.5) * majorSpacing;
  float majorLine = 1.0 - smoothstep(
    dF * (u_contourWidth * 0.78),
    dF * (u_contourWidth * 1.42 + 0.65),
    majorDist
  );

  float contourFactor = max(minorLine * 0.62, majorLine);
  vec3 contourRgb = mix(u_contourColor.rgb, vec3(1.0), majorLine * 0.28);

  vec3 outRgb = vec3(0.0);
  float outAlpha = 0.0;

  if (u_mode < 0.5) {
    // Pure topographic contour lines over satellite imagery
    outRgb = contourRgb;
    outAlpha = contourFactor * u_contourColor.a * u_opacity;
  } else {
    vec3 shadedRgb;
    if (u_mode < 1.5) {
      shadedRgb = elevationColor(h);
    } else if (u_mode < 2.5) {
      shadedRgb = slopeColor(materialInput.slope);
    } else {
      shadedRgb = aspectColor(materialInput.aspect, materialInput.slope);
    }

    float lineOverlay = contourFactor * u_showContours * u_contourColor.a;
    outRgb = mix(shadedRgb, contourRgb, lineOverlay * 0.85);
    outAlpha = max(u_opacity, lineOverlay * 0.95);
  }

  vec4 corrected = czm_gammaCorrect(vec4(outRgb, clamp(outAlpha, 0.0, 1.0)));
  material.diffuse = corrected.rgb;
  material.alpha = corrected.a;
  return material;
}
`;

function validateElevationRange(minElevation: number, maxElevation: number): void {
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    throw new RangeError('Expected minElevation and maxElevation to be finite numbers.');
  }
  if (minElevation >= maxElevation) {
    throw new RangeError('Expected minElevation to be strictly less than maxElevation.');
  }
}

/**
 * Applies a pure-GPU CesiumJS `globe.material` terrain analysis shader supporting live switching
 * between topographic contours, hypsometric elevation bands, geotechnical slope hazard, and
 * 360-degree terrain aspect — automatically saving and restoring any prior globe material.
 */
export function createTerrainAnalysis(
  viewer: Viewer,
  options: TerrainAnalysisOptions = {},
): TerrainAnalysisHandle {
  const state = {
    mode: options.mode ?? ('elevation' as TerrainAnalysisMode),
    contourSpacing: options.contourSpacing ?? 200,
    contourWidth: options.contourWidth ?? 1.4,
    contourColor: resolveColor(options.contourColor, Color.fromCssColorString('#f8fafc')),
    showContours: options.showContours ?? true,
    minElevation: options.minElevation ?? 1_000,
    maxElevation: options.maxElevation ?? 6_500,
    maxSlopeDegrees: options.maxSlopeDegrees ?? 60,
    opacity: options.opacity ?? 0.72,
  };

  validatePositiveFinite(state.contourSpacing, 'contourSpacing');
  validatePositiveFinite(state.contourWidth, 'contourWidth');
  validateElevationRange(state.minElevation, state.maxElevation);
  validatePositiveFinite(state.maxSlopeDegrees, 'maxSlopeDegrees');
  validateNonNegativeFinite(state.opacity, 'opacity');

  const material = new Material({
    fabric: {
      type: 'CesiumlabTerrainAnalysis',
      uniforms: {
        u_mode: MODE_INDEX[state.mode],
        u_contourSpacing: state.contourSpacing,
        u_contourWidth: state.contourWidth,
        u_contourColor: state.contourColor.clone(),
        u_showContours: state.showContours ? 1 : 0,
        u_minElevation: state.minElevation,
        u_maxElevation: state.maxElevation,
        u_maxSlopeRad: (state.maxSlopeDegrees * Math.PI) / 180,
        u_opacity: Math.min(1, state.opacity),
      },
      source: TERRAIN_ANALYSIS_SHADER,
    },
    translucent: true,
  });

  const globe = viewer.scene.globe;
  const previousMaterial = globe?.material;

  let visible = options.show ?? true;
  let paused = options.paused ?? false;
  let destroyed = false;

  const requestRender = () => {
    if (!viewer.isDestroyed()) {
      viewer.scene.requestRender?.();
    }
  };

  // Cesium's Globe.material setter inspects `globe._terrainProvider.hasVertexNormals` when
  // the material shader references `slope`. During async `Terrain.fromWorldTerrain()` startup,
  // `terrainProvider` is temporarily undefined until `terrainProviderChanged` fires.
  const hasTerrainProvider = (): boolean =>
    Boolean(viewer.terrainProvider ?? viewer.scene.terrainProvider);

  const applyVisibility = (nextVisible: boolean) => {
    if (!globe || viewer.isDestroyed()) return;
    if (nextVisible) {
      if (hasTerrainProvider()) {
        globe.material = material;
      }
    } else if (globe.material === material) {
      globe.material = previousMaterial;
    }
    requestRender();
  };

  const removeTerrainListener = viewer.scene.terrainProviderChanged?.addEventListener(() => {
    if (!destroyed && visible && globe && !viewer.isDestroyed() && hasTerrainProvider()) {
      globe.material = material;
      requestRender();
    }
  });

  if (visible) {
    applyVisibility(true);
  }

  return {
    show() {
      if (destroyed) return;
      visible = true;
      applyVisibility(true);
    },
    hide() {
      if (destroyed) return;
      visible = false;
      applyVisibility(false);
    },
    setVisible(nextVisible: boolean) {
      if (destroyed) return;
      visible = nextVisible;
      applyVisibility(nextVisible);
    },
    isVisible() {
      return !destroyed && visible;
    },
    setPaused(nextPaused: boolean) {
      if (destroyed) return;
      paused = nextPaused;
    },
    isPaused() {
      return paused;
    },
    restart() {
      if (destroyed) return;
      requestRender();
    },
    update(next: TerrainAnalysisUpdateOptions) {
      if (destroyed) return;

      const nextMin = next.minElevation ?? state.minElevation;
      const nextMax = next.maxElevation ?? state.maxElevation;
      if (next.minElevation !== undefined || next.maxElevation !== undefined) {
        validateElevationRange(nextMin, nextMax);
        state.minElevation = nextMin;
        state.maxElevation = nextMax;
        material.uniforms.u_minElevation = state.minElevation;
        material.uniforms.u_maxElevation = state.maxElevation;
      }

      if (next.mode !== undefined) {
        state.mode = next.mode;
        material.uniforms.u_mode = MODE_INDEX[state.mode];
      }
      if (next.contourSpacing !== undefined) {
        validatePositiveFinite(next.contourSpacing, 'contourSpacing');
        state.contourSpacing = next.contourSpacing;
        material.uniforms.u_contourSpacing = state.contourSpacing;
      }
      if (next.contourWidth !== undefined) {
        validatePositiveFinite(next.contourWidth, 'contourWidth');
        state.contourWidth = next.contourWidth;
        material.uniforms.u_contourWidth = state.contourWidth;
      }
      if (next.contourColor !== undefined) {
        state.contourColor = resolveColor(next.contourColor, state.contourColor);
        material.uniforms.u_contourColor = state.contourColor.clone();
      }
      if (next.showContours !== undefined) {
        state.showContours = next.showContours;
        material.uniforms.u_showContours = state.showContours ? 1 : 0;
      }
      if (next.maxSlopeDegrees !== undefined) {
        validatePositiveFinite(next.maxSlopeDegrees, 'maxSlopeDegrees');
        state.maxSlopeDegrees = next.maxSlopeDegrees;
        material.uniforms.u_maxSlopeRad = (state.maxSlopeDegrees * Math.PI) / 180;
      }
      if (next.opacity !== undefined) {
        validateNonNegativeFinite(next.opacity, 'opacity');
        state.opacity = Math.min(1, next.opacity);
        material.uniforms.u_opacity = state.opacity;
      }

      requestRender();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      visible = false;
      removeTerrainListener?.();
      if (globe && !viewer.isDestroyed() && globe.material === material) {
        globe.material = previousMaterial;
        viewer.scene.requestRender?.();
      }
    },
    isDestroyed() {
      return destroyed;
    },
  };
}
