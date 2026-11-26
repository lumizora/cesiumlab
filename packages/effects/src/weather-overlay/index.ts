import { Color, PostProcessStage, type Viewer } from '@cesiumlab/cesium';
import { createAnimationClock } from '../shared/clock.ts';
import type { EffectBaseOptions, EffectHandle } from '../shared/effect.ts';
import {
  resolveColor,
  validateNonNegativeFinite,
  validatePositiveFinite,
  type ColorInput,
} from '../shared/geo.ts';

export type WeatherMode = 'rain' | 'snow' | 'fog';

export interface WeatherOverlayOptions extends EffectBaseOptions {
  /** Weather effect type: `'rain'`, `'snow'`, or depth-based `'fog'`. Defaults to `'rain'`. */
  mode?: WeatherMode;
  /** Overall intensity / density multiplier (0 to 2). Defaults to 0.75. */
  intensity?: number;
  /** Fall / drift animation speed multiplier. Defaults to 1. */
  speed?: number;
  /** Horizontal wind slant / drift (-1 to 1). Defaults to 0.25. */
  wind?: number;
  /** Tint color for rain streaks, snowflakes, or fog haze. Defaults to a mode-appropriate tint. */
  color?: ColorInput;
  /** Visibility distance in metres for `'fog'` mode (lower = denser fog). Defaults to 18_000. */
  fogVisibility?: number;
}

export type WeatherOverlayUpdateOptions = Pick<
  WeatherOverlayOptions,
  'mode' | 'intensity' | 'speed' | 'wind' | 'color' | 'fogVisibility'
>;

export type WeatherOverlayHandle = EffectHandle<WeatherOverlayUpdateOptions>;

const DEFAULT_RAIN_COLOR = Color.fromCssColorString('#dbeafe');
const DEFAULT_SNOW_COLOR = Color.fromCssColorString('#f8fafc');
const DEFAULT_FOG_COLOR = Color.fromCssColorString('#cbd5e1');

function getModeCode(mode: WeatherMode): number {
  switch (mode) {
    case 'rain':
      return 0;
    case 'snow':
      return 1;
    case 'fog':
      return 2;
  }
}

function getDefaultColorForMode(mode: WeatherMode): Color {
  switch (mode) {
    case 'rain':
      return DEFAULT_RAIN_COLOR;
    case 'snow':
      return DEFAULT_SNOW_COLOR;
    case 'fog':
      return DEFAULT_FOG_COLOR;
  }
}

const WEATHER_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;

uniform float u_mode;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_wind;
uniform vec4 u_color;
uniform float u_fogVisibility;

in vec2 v_textureCoordinates;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Single parallax layer of slanted rain streaks.
float rainLayer(vec2 uv, float scale, float speedMul, float t, float windSlant, float density) {
  vec2 p = uv;
  p.x += p.y * windSlant;
  p *= vec2(scale * 1.45, scale * 0.22);
  p.y += t * speedMul;

  vec2 cell = floor(p);
  vec2 local = fract(p);

  float rnd = hash12(cell);
  if (rnd > clamp(density, 0.05, 0.96)) {
    return 0.0;
  }

  float xOffset = 0.15 + 0.7 * hash12(cell + vec2(17.3, 9.1));
  float yOffset = hash12(cell + vec2(4.7, 29.4));
  float dx = abs(local.x - xOffset);
  float streakWidth = mix(0.032, 0.016, rnd);
  float radial = exp(-pow(dx / streakWidth, 2.0));

  float yLocal = fract(local.y + yOffset);
  // Tapered falling rain streak: sharp bright leading tip, softly fading tail above.
  float longitudinal = smoothstep(0.0, 0.12, yLocal) * pow(1.0 - yLocal, 1.85);
  return radial * longitudinal * (0.45 + 0.55 * rnd);
}

// Single parallax layer of fine, wind-swaying snowflakes with subtle motion elongation.
float snowLayer(vec2 uv, float scale, float speedMul, float t, float windDrift, float density) {
  vec2 p = uv * scale;
  p.y += t * speedMul;
  p.x -= t * windDrift * speedMul * 0.72;

  vec2 cell = floor(p);
  vec2 local = fract(p) - 0.5;

  vec2 rnd = hash22(cell);
  if (rnd.x > clamp(density, 0.05, 0.9)) {
    return 0.0;
  }

  // Dual-frequency organic lateral flutter per snowflake.
  float phase = rnd.x * 6.2831853 + rnd.y * 11.3;
  float sway =
    sin(t * (1.1 + rnd.y * 1.4) + phase) * 0.16 +
    sin(t * (2.3 + rnd.x * 1.7) + phase * 1.7) * 0.06;
  vec2 delta = local - vec2((rnd.x - 0.5) * 0.48 + sway, (rnd.y - 0.5) * 0.52);

  // Subtle elongation along fall/wind vector for natural motion softness (avoids rigid circles).
  vec2 fallDir = normalize(vec2(-windDrift * 0.65, 1.0));
  vec2 perpDir = vec2(-fallDir.y, fallDir.x);
  float along = dot(delta, fallDir) * 0.85;
  float across = dot(delta, perpDir) * 1.15;
  float dist = length(vec2(along, across));

  float radius = mix(0.055, 0.105, rnd.y);
  float flake = exp(-pow(dist / radius, 2.2));
  // Gentle twinkle as snowflakes tumble in the wind.
  float tumble = 0.76 + 0.24 * sin(t * (2.6 + rnd.x * 3.5) + phase);
  return flake * tumble * (0.5 + 0.5 * rnd.y);
}

// Smooth procedural drifting mist noise for seamless atmospheric haze (zero frustum seams).
float mistNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float mistFbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    v += a * mistNoise(p);
    p = p * 2.05 + vec2(7.3, 4.1);
    a *= 0.48;
  }
  return v;
}

void main(void) {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates;
  float aspect = czm_viewport.z / max(1.0, czm_viewport.w);
  vec2 aspectUv = vec2(uv.x * aspect, uv.y);
  float t = u_time * u_speed;
  float intensity = clamp(u_intensity, 0.0, 2.0);

  if (u_mode < 0.5) {
    // --- RAIN MODE: 4 parallax streak layers + subtle overcast atmosphere ---
    float density = clamp(0.28 + intensity * 0.36, 0.0, 0.95);
    float windSlant = u_wind * 0.38;

    float r1 = rainLayer(aspectUv, 26.0, 3.8, t, windSlant, density) * 0.72;
    float r2 = rainLayer(aspectUv + vec2(3.1, 1.7), 42.0, 2.9, t, windSlant, density) * 0.55;
    float r3 = rainLayer(aspectUv + vec2(7.4, 5.2), 68.0, 2.2, t, windSlant, density) * 0.38;
    float r4 = rainLayer(aspectUv + vec2(11.8, 2.9), 104.0, 1.6, t, windSlant, density) * 0.24;

    float rainMask = clamp((r1 + r2 + r3 + r4) * (0.45 + intensity * 0.55), 0.0, 0.88);

    // Subtle overcast cool desaturation proportional to rain intensity.
    float lum = czm_luminance(sceneColor.rgb);
    vec3 overcast = mix(sceneColor.rgb, vec3(lum) * vec3(0.9, 0.95, 1.04), clamp(intensity * 0.16, 0.0, 0.28));
    vec3 finalRgb = mix(overcast, u_color.rgb, rainMask * 0.72);
    out_FragColor = vec4(finalRgb, sceneColor.a);
    return;
  }

  if (u_mode < 1.5) {
    // --- SNOW MODE: 4 fine parallax snow layers + cool winter atmosphere ---
    float density = clamp(0.24 + intensity * 0.36, 0.0, 0.88);

    float s1 = snowLayer(aspectUv, 14.0, 0.72, t, u_wind, density * 0.55) * 0.82;
    float s2 = snowLayer(aspectUv + vec2(2.3, 4.1), 22.0, 0.56, t, u_wind, density * 0.78) * 0.72;
    float s3 = snowLayer(aspectUv + vec2(6.7, 1.9), 34.0, 0.42, t, u_wind, density) * 0.58;
    float s4 = snowLayer(aspectUv + vec2(9.5, 8.3), 52.0, 0.30, t, u_wind, density) * 0.42;

    float snowMask = clamp((s1 + s2 + s3 + s4) * (0.55 + intensity * 0.55), 0.0, 0.92);

    // Subtle cool winter desaturation and soft upper-horizon chill mist (no frustum seam).
    float lum = czm_luminance(sceneColor.rgb);
    vec3 winterTone = mix(sceneColor.rgb, vec3(lum) * vec3(0.94, 0.97, 1.04), clamp(intensity * 0.16, 0.0, 0.26));
    float softMist = smoothstep(0.1, 1.0, uv.y) * clamp(intensity * 0.14, 0.0, 0.22);
    vec3 hazyScene = mix(winterTone, u_color.rgb * 0.94, softMist);
    vec3 finalRgb = mix(hazyScene, u_color.rgb, snowMask * 0.88);
    out_FragColor = vec4(finalRgb, sceneColor.a);
    return;
  }

  // --- FOG MODE: Realistic slow wind-drifting advection mist layered with Cesium's native scene.fog ---
  vec2 windVec = vec2(-u_wind, -0.06);
  vec2 baseDrift = windVec * (t * 0.11);
  // Broad, soft domain-warped FBM for natural mountain mist rather than fast/blotchy clouds.
  float warp = mistFbm(aspectUv * 1.35 + baseDrift * 0.55);
  float cloudA = mistFbm(aspectUv * 1.65 + baseDrift + vec2(warp * 0.35, -warp * 0.22));
  float cloudB = mistFbm(aspectUv * 3.1 + baseDrift * 1.45 + vec2(5.2 - warp * 0.25, -3.1));
  float wisps = smoothstep(0.24, 0.84, cloudA * 0.68 + cloudB * 0.32);
  float mistPattern = 0.62 + 0.38 * wisps;

  // Keep immediate foreground crisp while mist thickens naturally toward distant ridges.
  float visFactor = clamp(14000.0 / max(2000.0, u_fogVisibility), 0.15, 2.0);
  float horizonGrad = mix(0.14, 0.96, smoothstep(0.0, 0.86, uv.y));
  float fogFactor = clamp(horizonGrad * mistPattern * (0.20 + intensity * 0.34) * visFactor, 0.0, 0.82);

  vec3 finalRgb = mix(sceneColor.rgb, u_color.rgb, fogFactor);
  out_FragColor = vec4(finalRgb, sceneColor.a);
}
`;

/**
 * Adds a pure-GPU screen-space weather PostProcessStage supporting multi-layer parallax
 * rain, swaying snow, and depth-buffer atmospheric fog with zero CPU particle overhead.
 */
export function createWeatherOverlay(
  viewer: Viewer,
  options: WeatherOverlayOptions = {},
): WeatherOverlayHandle {
  const initialMode: WeatherMode = options.mode ?? 'rain';
  let hasCustomColor = options.color !== undefined;

  const state = {
    mode: initialMode,
    intensity: options.intensity ?? 0.75,
    speed: options.speed ?? 1,
    wind: options.wind ?? 0.25,
    color: resolveColor(options.color, getDefaultColorForMode(initialMode)),
    fogVisibility: options.fogVisibility ?? 18_000,
    time: 0,
  };

  validateNonNegativeFinite(state.intensity, 'intensity');
  validateNonNegativeFinite(state.speed, 'speed');
  if (!Number.isFinite(state.wind)) {
    throw new RangeError('Expected wind to be a finite number.');
  }
  validatePositiveFinite(state.fogVisibility, 'fogVisibility');

  const stage = new PostProcessStage({
    fragmentShader: WEATHER_FRAGMENT_SHADER,
    uniforms: {
      u_mode: () => getModeCode(state.mode),
      u_time: () => state.time,
      u_intensity: () => state.intensity,
      u_speed: () => state.speed,
      u_wind: () => state.wind,
      u_color: () => state.color,
      u_fogVisibility: () => state.fogVisibility,
    },
  });

  let visible = options.show ?? true;
  let destroyed = false;
  stage.enabled = visible;

  // Snapshot Cesium's native multi-frustum scene fog so we can enhance 3D distance fog cleanly and restore on teardown.
  const sceneFog = viewer.scene.fog;
  const savedFog = sceneFog
    ? {
        enabled: sceneFog.enabled,
        density: sceneFog.density,
        minimumBrightness: sceneFog.minimumBrightness,
      }
    : null;

  const syncNativeFog = () => {
    if (!sceneFog || !savedFog || viewer.isDestroyed()) return;
    if (visible && state.mode === 'fog') {
      sceneFog.enabled = true;
      sceneFog.density = Math.min(
        0.0025,
        (1 / Math.max(1_000, state.fogVisibility)) * (0.8 + state.intensity * 1.4),
      );
      sceneFog.minimumBrightness = 0.45;
    } else {
      sceneFog.enabled = savedFog.enabled;
      sceneFog.density = savedFog.density;
      sceneFog.minimumBrightness = savedFog.minimumBrightness;
    }
  };

  viewer.scene.postProcessStages.add(stage);
  syncNativeFog();

  const clock = createAnimationClock(viewer, options.paused ?? false, (elapsedSeconds) => {
    state.time = elapsedSeconds;
  });

  const setVisible = (nextVisible: boolean) => {
    if (destroyed) return;
    visible = nextVisible;
    stage.enabled = visible;
    syncNativeFog();
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
      if (next.mode !== undefined && next.mode !== state.mode) {
        state.mode = next.mode;
        if (!hasCustomColor && next.color === undefined) {
          state.color = getDefaultColorForMode(state.mode);
        }
      }
      if (next.color !== undefined) {
        hasCustomColor = true;
        state.color = resolveColor(next.color, getDefaultColorForMode(state.mode));
      }
      if (next.intensity !== undefined) {
        validateNonNegativeFinite(next.intensity, 'intensity');
        state.intensity = next.intensity;
      }
      if (next.speed !== undefined) {
        validateNonNegativeFinite(next.speed, 'speed');
        state.speed = next.speed;
      }
      if (next.wind !== undefined) {
        if (!Number.isFinite(next.wind)) {
          throw new RangeError('Expected wind to be a finite number.');
        }
        state.wind = next.wind;
      }
      if (next.fogVisibility !== undefined) {
        validatePositiveFinite(next.fogVisibility, 'fogVisibility');
        state.fogVisibility = next.fogVisibility;
      }
      stage.enabled = visible;
      syncNativeFog();
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
    },
    isDestroyed() {
      return destroyed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      visible = false;
      clock.destroy();
      if (!viewer.isDestroyed()) {
        viewer.scene.postProcessStages.remove(stage);
        if (sceneFog && savedFog) {
          sceneFog.enabled = savedFog.enabled;
          sceneFog.density = savedFog.density;
          sceneFog.minimumBrightness = savedFog.minimumBrightness;
        }
      }
    },
  };
}
