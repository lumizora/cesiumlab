/**
 * WebGL2 Ping-Pong floating-point FBO 2D Shallow Water Equations (SWE) solver.
 *
 * Supports two physically-based simulation modes on a shared terrain heightfield:
 * 1. `'ripples'`: 2D shallow-water wave equation with depth-dependent wave speed
 *    c = sqrt(g * d) and hard reflective boundaries where terrain emerges above water.
 * 2. `'flow'`: Virtual-pipe flux-based shallow-water equations (Mei et al.) with
 *    gravity-driven downhill routing, mass conservation, and whitewater foam.
 *
 * Runs entirely in an offscreen WebGL2 context (zero Cesium private APIs) and
 * degrades gracefully to `null` when WebGL2 or float render targets are unavailable.
 */

export type ShallowWaterMode = 'ripples' | 'flow';

export interface ShallowWaterSolverConfig {
  /** Simulation grid resolution (width & height in texels). */
  resolution: number;
  /** Simulation physics mode: 'ripples' (wave interference & reflection) or 'flow' (terrain gravity flow). */
  mode: ShallowWaterMode;
  /** Wave propagation speed / gravity multiplier (0.2 to 2.5). */
  waveSpeed: number;
  /** Energy / velocity damping factor (0.002 to 0.08). */
  damping: number;
  /** Shallow water tint in linear-ish [0..1] RGB. */
  shallowColor: readonly [number, number, number];
  /** Deep water tint in linear-ish [0..1] RGB. */
  deepColor: readonly [number, number, number];
  /** Sun specular & glint intensity (0 to 2). */
  specularIntensity: number;
  /** Whitewater foam intensity (0 to 2). */
  foamIntensity: number;
  /** Water level threshold [0..1] for 'ripples' mode shoreline masking. */
  waterLevel: number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: { texture: WebGLTexture; fbo: WebGLFramebuffer };
  write: { texture: WebGLTexture; fbo: WebGLFramebuffer };
  swap(): void;
}

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

const VERT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Clear FBO to a constant RGBA value
const CLEAR_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uValue;
out vec4 fragColor;
void main() {
  fragColor = uValue;
}
`;

// Mode 1 ('ripples'): Inject a smooth circular wave disturbance
const RIPPLE_DROP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform sampler2D uTerrain;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uStrength;
uniform float uWaterLevel;
out vec4 fragColor;

void main() {
  vec4 state = texture(uState, vUv);
  float bed = texture(uTerrain, vUv).r;
  float depth = max(0.0, uWaterLevel - bed);
  float d = length(vUv - uPoint);
  float mask = smoothstep(uRadius, 0.0, d);
  // Smooth cosine bell displacement so ripples have clean wavefronts without ringing
  float bell = 0.5 - 0.5 * cos(mask * 3.14159265);
  float wetMask = smoothstep(0.01, 0.06, depth);
  float delta = bell * uStrength * wetMask;
  state.r = clamp(state.r + delta, -2.0, 2.0);
  state.b = clamp(state.b + abs(delta) * 0.85, 0.0, 2.0);
  fragColor = state;
}
`;

// Mode 1 ('ripples'): 2D shallow-water wave equation with depth-varying wave speed
// and reflective Neumann boundary conditions along dry terrain shorelines.
const RIPPLE_STEP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform sampler2D uTerrain;
uniform vec2 uTexelSize;
uniform float uWaveSpeed;
uniform float uDamping;
uniform float uWaterLevel;
out vec4 fragColor;

void main() {
  vec4 cur = texture(uState, vUv);
  float bedC = texture(uTerrain, vUv).r;
  float depthC = max(0.0, uWaterLevel - bedC);

  if (depthC <= 0.004) {
    fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec2 uvL = clamp(vUv - vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvR = clamp(vUv + vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvB = clamp(vUv - vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));
  vec2 uvT = clamp(vUv + vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));

  float hC = cur.r;
  float hPrev = cur.g;

  // Neumann reflection: if a neighbor is dry land (bed >= waterLevel), mirror center elevation
  float hL = (uWaterLevel - texture(uTerrain, uvL).r) > 0.004 ? texture(uState, uvL).r : hC;
  float hR = (uWaterLevel - texture(uTerrain, uvR).r) > 0.004 ? texture(uState, uvR).r : hC;
  float hB = (uWaterLevel - texture(uTerrain, uvB).r) > 0.004 ? texture(uState, uvB).r : hC;
  float hT = (uWaterLevel - texture(uTerrain, uvT).r) > 0.004 ? texture(uState, uvT).r : hC;

  // Shallow-water wave speed c^2 = g * d, clamped below CFL stability limit (0.48)
  float depthFactor = sqrt(clamp(depthC / max(uWaterLevel, 0.1), 0.08, 1.0));
  float c2 = clamp(0.24 * uWaveSpeed * uWaveSpeed * depthFactor, 0.02, 0.45);

  float laplacian = (hL + hR + hB + hT) - 4.0 * hC;
  float damp = clamp(1.0 - uDamping, 0.9, 0.999);
  float hNext = (2.0 * hC - hPrev + c2 * laplacian) * damp;

  // Gentle sponge absorption right at outer rectangle borders to avoid artificial box echoes
  vec2 edgeDist = min(vUv, 1.0 - vUv);
  float borderDamp = smoothstep(0.0, 0.035, min(edgeDist.x, edgeDist.y));
  hNext *= mix(0.92, 1.0, borderDamp);
  hNext = clamp(hNext, -2.5, 2.5);

  // Track wave crest / shoreline impact energy for subtle foam
  float slope = abs(hR - hL) + abs(hT - hB);
  float shoreBoost = smoothstep(0.18, 0.01, depthC);
  float foam = max(cur.b * 0.965, clamp(slope * (1.8 + shoreBoost * 3.0), 0.0, 1.5));

  fragColor = vec4(hNext, hC, foam, depthC);
}
`;

// Mode 2 ('flow'): Inject water volume at a point (mountain spring / rain / interactive click)
const FLOW_SOURCE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uAmount;
out vec4 fragColor;

void main() {
  vec4 state = texture(uHeight, vUv);
  float d = length(vUv - uPoint);
  float mask = smoothstep(uRadius, 0.0, d);
  float add = mask * mask * uAmount;
  state.r = clamp(state.r + add, 0.0, 1.2);
  state.a = clamp(state.a + add * 2.5, 0.0, 1.5);
  fragColor = state;
}
`;

// Mode 2 ('flow'): Virtual-pipe flux update (Mei et al. 2007)
// Stores outgoing fluxes (left, right, top, bottom) in RGBA16F.
const FLOW_FLUX_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform sampler2D uFlux;
uniform sampler2D uTerrain;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uGravity;
uniform float uFriction;
out vec4 fragColor;

void main() {
  float hC = texture(uHeight, vUv).r;
  float bC = texture(uTerrain, vUv).r;
  float totalC = bC + hC;

  vec2 uvL = clamp(vUv - vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvR = clamp(vUv + vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvT = clamp(vUv + vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));
  vec2 uvB = clamp(vUv - vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));

  float totalL = texture(uTerrain, uvL).r + texture(uHeight, uvL).r;
  float totalR = texture(uTerrain, uvR).r + texture(uHeight, uvR).r;
  float totalT = texture(uTerrain, uvT).r + texture(uHeight, uvT).r;
  float totalB = texture(uTerrain, uvB).r + texture(uHeight, uvB).r;

  vec4 oldFlux = texture(uFlux, vUv) * clamp(1.0 - uFriction, 0.85, 0.998);
  float accel = uDt * uGravity;

  float fL = max(0.0, oldFlux.r + accel * (totalC - totalL));
  float fR = max(0.0, oldFlux.g + accel * (totalC - totalR));
  float fT = max(0.0, oldFlux.b + accel * (totalC - totalT));
  float fB = max(0.0, oldFlux.a + accel * (totalC - totalB));

  // Open outflow at outer domain borders so water drains cleanly off the map edges
  float sumFlux = fL + fR + fT + fB;
  float scale = sumFlux > 1e-6 ? min(1.0, hC / (sumFlux * uDt + 1e-6)) : 0.0;

  fragColor = vec4(fL, fR, fT, fB) * scale;
}
`;

// Mode 2 ('flow'): Update water depth, horizontal velocity, and whitewater foam from fluxes
const FLOW_UPDATE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform sampler2D uFlux;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uEvaporation;
out vec4 fragColor;

void main() {
  vec4 prev = texture(uHeight, vUv);
  vec4 fC = texture(uFlux, vUv);

  vec2 uvL = vUv - vec2(uTexelSize.x, 0.0);
  vec2 uvR = vUv + vec2(uTexelSize.x, 0.0);
  vec2 uvT = vUv + vec2(0.0, uTexelSize.y);
  vec2 uvB = vUv - vec2(0.0, uTexelSize.y);

  // Zero inflow from outside the simulation rectangle
  float inL = uvL.x >= 0.0 ? texture(uFlux, uvL).g : 0.0;
  float inR = uvR.x <= 1.0 ? texture(uFlux, uvR).r : 0.0;
  float inT = uvT.y <= 1.0 ? texture(uFlux, uvT).a : 0.0;
  float inB = uvB.y >= 0.0 ? texture(uFlux, uvB).b : 0.0;

  float outSum = fC.r + fC.g + fC.b + fC.a;
  float inSum = inL + inR + inT + inB;
  float hNext = max(0.0, prev.r + uDt * (inSum - outSum) - uEvaporation * uDt);

  // Soft drain right at outer border
  vec2 edgeDist = min(vUv, 1.0 - vUv);
  float borderMask = smoothstep(0.0, 0.025, min(edgeDist.x, edgeDist.y));
  hNext *= mix(0.92, 1.0, borderMask);

  // Average net flux -> velocity estimate
  float avgH = max(0.015, 0.5 * (prev.r + hNext));
  float vx = 0.5 * ((inL - fC.r) + (fC.g - inR)) / avgH;
  float vy = 0.5 * ((inB - fC.a) + (fC.b - inT)) / avgH;
  float speed = length(vec2(vx, vy));

  float foam = max(prev.a * 0.96, smoothstep(0.18, 1.1, speed) * smoothstep(0.004, 0.04, hNext));
  fragColor = vec4(clamp(hNext, 0.0, 1.5), clamp(vx, -4.0, 4.0), clamp(vy, -4.0, 4.0), clamp(foam, 0.0, 1.5));
}
`;

// Unified physically-based water display shader (Fresnel + Beer-Lambert + solar glint + foam)
const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform sampler2D uTerrain;
uniform vec2 uTexelSize;
uniform int uMode; // 0 = ripples, 1 = flow
uniform float uWaterLevel;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uSpecularIntensity;
uniform float uFoamIntensity;
uniform float uTime;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uvL = clamp(vUv - vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvR = clamp(vUv + vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
  vec2 uvB = clamp(vUv - vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));
  vec2 uvT = clamp(vUv + vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0));

  vec4 stateC = texture(uState, vUv);
  float bedC = texture(uTerrain, vUv).r;

  float depth;
  float foamEnergy;
  vec3 normal;
  float causticWave = 0.0;

  if (uMode == 0) {
    // Ripples mode: state.r = elevation eta, state.b = foam, state.a = water depth
    depth = max(0.0, uWaterLevel - bedC);
    if (depth <= 0.005) {
      fragColor = vec4(0.0);
      return;
    }
    float hL = texture(uState, uvL).r;
    float hR = texture(uState, uvR).r;
    float hB = texture(uState, uvB).r;
    float hT = texture(uState, uvT).r;

    // Gentle micro-shimmer on top of real PDE ripple slope
    float micro = (valueNoise(vUv * 42.0 + vec2(uTime * 0.25, -uTime * 0.18)) - 0.5) * 0.035;
    float dx = (hR - hL) * 4.2 + micro;
    float dy = (hT - hB) * 4.2 - micro;
    normal = normalize(vec3(-dx, -dy, 0.62));
    foamEnergy = stateC.b;
    causticWave = clamp((hL + hR + hB + hT - 4.0 * stateC.r) * -2.2, 0.0, 1.0);
  } else {
    // Flow mode: state.r = water depth h, state.gb = velocity, state.a = foam
    depth = stateC.r;
    if (depth <= 0.0025) {
      fragColor = vec4(0.0);
      return;
    }
    float sL = texture(uTerrain, uvL).r + texture(uState, uvL).r;
    float sR = texture(uTerrain, uvR).r + texture(uState, uvR).r;
    float sB = texture(uTerrain, uvB).r + texture(uState, uvB).r;
    float sT = texture(uTerrain, uvT).r + texture(uState, uvT).r;

    vec2 vel = stateC.gb;
    // Advected micro-ripple detail moving with real SWE velocity
    float flowDetail = (valueNoise(vUv * 36.0 - vel * uTime * 0.4 + vec2(uTime * 0.15)) - 0.5) * 0.08;
    float dx = (sR - sL) * 6.5 + flowDetail;
    float dy = (sT - sB) * 6.5 + flowDetail * 0.8;
    normal = normalize(vec3(-dx, -dy, 0.55));
    foamEnergy = stateC.a;
    causticWave = clamp(length(vel) * 0.45, 0.0, 1.0);
  }

  // Lighting: sun + view direction in local tangent space
  vec3 sunDir = normalize(vec3(0.45, 0.55, 0.70));
  vec3 viewDir = normalize(vec3(0.0, -0.35, 0.94));
  vec3 halfVec = normalize(sunDir + viewDir);

  float NdotV = max(dot(normal, viewDir), 0.05);
  float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 4.2);

  // Beer-Lambert depth absorption: shallow turquoise -> deep marine blue
  float depthRatio = uMode == 0
    ? smoothstep(0.02, max(uWaterLevel * 0.85, 0.2), depth)
    : smoothstep(0.005, 0.16, depth);
  vec3 bodyColor = mix(uShallowColor, uDeepColor, depthRatio);

  // Subtle subsurface scattering & caustic brightening on shallow wave crests
  float sss = pow(max(0.0, dot(normal, normalize(vec3(0.3, 0.4, 0.85)))), 2.0);
  bodyColor += uShallowColor * (0.18 * sss + 0.22 * causticWave) * (1.0 - 0.55 * depthRatio);

  // Sky reflection
  vec3 skyColor = vec3(0.68, 0.83, 0.96);
  vec3 color = mix(bodyColor, skyColor, clamp(fresnel * 0.65, 0.0, 0.78));

  // Dual-lobe solar specular glint
  float specTight = pow(max(dot(normal, halfVec), 0.0), 160.0) * 1.45;
  float specBroad = pow(max(dot(normal, halfVec), 0.0), 28.0) * 0.28;
  color += vec3(1.0, 0.97, 0.90) * (specTight + specBroad) * uSpecularIntensity;

  // Shoreline & rapid whitewater foam
  float foamNoise = valueNoise(vUv * 55.0 + vec2(uTime * 0.3, -uTime * 0.2));
  float shoreLine = uMode == 0
    ? smoothstep(0.055, 0.008, depth) * (0.45 + 0.55 * foamNoise)
    : smoothstep(0.022, 0.003, depth) * (0.35 + 0.65 * foamNoise);
  float foamMask = clamp((foamEnergy * (0.65 + 0.55 * foamNoise) + shoreLine * 0.65) * uFoamIntensity, 0.0, 0.92);
  color = mix(color, vec3(0.93, 0.97, 1.0), foamMask);

  // Smooth alpha at shorelines, dry ground, and outer rectangle border
  vec2 edgeDist = min(vUv, 1.0 - vUv);
  float edgeFeather = smoothstep(0.0, 0.045, min(edgeDist.x, edgeDist.y));
  float wetAlpha = uMode == 0
    ? smoothstep(0.005, 0.045, depth) * mix(0.76, 0.94, depthRatio)
    : smoothstep(0.0025, 0.028, depth) * mix(0.68, 0.94, depthRatio);
  float alpha = clamp((wetAlpha + foamMask * 0.25) * edgeFeather, 0.0, 0.96);

  fragColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
`;

/**
 * Generates a procedural terrain heightfield in [0, 1] for immediate visual fidelity
 * before (or without) real Cesium globe terrain sampling.
 */
export function generateProceduralTerrain(
  size: number,
  preset: 'basin' | 'valley' | 'flat',
): Float32Array {
  const data = new Float32Array(size * size);
  if (preset === 'flat') {
    data.fill(0.08);
    return data;
  }

  const fbm = (x: number, y: number): number => {
    let val = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < 4; o += 1) {
      const n =
        Math.sin(x * freq * 3.1 + Math.cos(y * freq * 2.7)) * 0.5 +
        Math.cos(y * freq * 3.5 - Math.sin(x * freq * 2.3)) * 0.5;
      val += (n * 0.5 + 0.5) * amp;
      freq *= 2.05;
      amp *= 0.5;
    }
    return val;
  };

  for (let j = 0; j < size; j += 1) {
    const v = j / (size - 1);
    for (let i = 0; i < size; i += 1) {
      const u = i / (size - 1);
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.hypot(dx, dy);

      let h: number;
      if (preset === 'basin') {
        // Coastal mountain-ringed lake basin with two small rocky islands for ripple reflection
        const rim = Math.max(0, (r - 0.34) * 3.2);
        const island1 = Math.exp(-(((u - 0.36) ** 2 + (v - 0.56) ** 2) / 0.0055)) * 0.68;
        const island2 = Math.exp(-(((u - 0.67) ** 2 + (v - 0.42) ** 2) / 0.0042)) * 0.62;
        const shoal = fbm(u * 2.5, v * 2.5) * 0.22;
        h = Math.min(1, 0.08 + shoal + rim * rim * 0.55 + island1 + island2);
      } else {
        // 'valley': Sloped mountain gorge with a central meandering river channel + branching ridge
        const slope = 0.68 * (1 - v) + 0.12 * Math.abs(u - 0.5);
        const meander = 0.5 + 0.14 * Math.sin(v * Math.PI * 2.2);
        const distToChannel = Math.abs(u - meander);
        const gorgeWalls = Math.min(0.52, (distToChannel / 0.32) ** 1.75 * 0.52);
        // A mid-valley rocky ridge that splits the flow into two braided channels
        const splitRidge = Math.exp(-(((u - 0.52) ** 2 + (v - 0.46) ** 2) / 0.008)) * 0.28;
        const detail = (fbm(u * 3.2, v * 3.2) - 0.5) * 0.14;
        h = Math.max(0, Math.min(1, slope * 0.65 + gorgeWalls + splitRidge + detail));
      }

      data[j * size + i] = h;
    }
  }
  return data;
}

export class ShallowWaterSolver {
  public readonly canvas: HTMLCanvasElement;
  public readonly width: number;
  public readonly height: number;

  private readonly gl: WebGL2RenderingContext;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly quadVbo: WebGLBuffer;

  private readonly clearProg: ShaderProgram;
  private readonly rippleDropProg: ShaderProgram;
  private readonly rippleStepProg: ShaderProgram;
  private readonly flowSourceProg: ShaderProgram;
  private readonly flowFluxProg: ShaderProgram;
  private readonly flowUpdateProg: ShaderProgram;
  private readonly displayProg: ShaderProgram;

  private readonly stateFbo: DoubleFBO;
  private readonly fluxFbo: DoubleFBO;
  private readonly terrainTexture: WebGLTexture;

  private config: ShallowWaterSolverConfig;
  private elapsed = 0;
  private destroyed = false;

  public static create(config: ShallowWaterSolverConfig): ShallowWaterSolver | null {
    if (typeof document === 'undefined') return null;

    const size = Math.max(64, Math.min(384, Math.round(config.resolution)));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return null;

    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) return null;
    gl.getExtension('OES_texture_float_linear');

    try {
      return new ShallowWaterSolver(canvas, gl, size, config);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    size: number,
    config: ShallowWaterSolverConfig,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.width = size;
    this.height = size;
    this.config = { ...config };

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create fullscreen quad geometry.');
    this.quadVao = vao;
    this.quadVbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.clearProg = this.createProgram(CLEAR_FRAG);
    this.rippleDropProg = this.createProgram(RIPPLE_DROP_FRAG);
    this.rippleStepProg = this.createProgram(RIPPLE_STEP_FRAG);
    this.flowSourceProg = this.createProgram(FLOW_SOURCE_FRAG);
    this.flowFluxProg = this.createProgram(FLOW_FLUX_FRAG);
    this.flowUpdateProg = this.createProgram(FLOW_UPDATE_FRAG);
    this.displayProg = this.createProgram(DISPLAY_FRAG);

    this.stateFbo = this.createDoubleFBO(size, size, gl.LINEAR);
    this.fluxFbo = this.createDoubleFBO(size, size, gl.NEAREST);

    const terrainTex = gl.createTexture();
    if (!terrainTex) throw new Error('Failed to create terrain heightfield texture.');
    this.terrainTexture = terrainTex;

    const initialTerrain = generateProceduralTerrain(
      size,
      config.mode === 'flow' ? 'valley' : 'basin',
    );
    this.uploadTerrain(initialTerrain, size, size);
    this.clear();
  }

  public updateConfig(patch: Partial<ShallowWaterSolverConfig>): void {
    const modeChanged = patch.mode !== undefined && patch.mode !== this.config.mode;
    this.config = { ...this.config, ...patch };
    if (modeChanged) {
      this.clear();
    }
  }

  public uploadTerrain(heights: Float32Array, width: number, height: number): void {
    if (this.destroyed) return;
    const gl = this.gl;
    // Pack into RGBA8 (or R16F? RGBA8 normalized [0..255] is universally filterable with LINEAR!)
    // Using R32F/R16F with LINEAR can fail without OES_texture_float_linear on some GPUs,
    // whereas RGBA16F or RGBA8 with LINEAR works everywhere. We pack into RGBA8 (R = height).
    const packed = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const v = Math.max(0, Math.min(1, heights[i] ?? 0));
      const byte = Math.round(v * 255);
      const idx = i * 4;
      packed[idx] = byte;
      packed[idx + 1] = byte;
      packed[idx + 2] = byte;
      packed[idx + 3] = 255;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  }

  public drop(u: number, v: number, strength: number, radius: number): void {
    if (this.destroyed) return;
    const gl = this.gl;

    if (this.config.mode === 'ripples') {
      this.useProgram(this.rippleDropProg);
      this.bindTexture(this.rippleDropProg, 'uState', this.stateFbo.read.texture, 0);
      this.bindTexture(this.rippleDropProg, 'uTerrain', this.terrainTexture, 1);
      gl.uniform2f(this.rippleDropProg.uniforms.uPoint, u, v);
      gl.uniform1f(this.rippleDropProg.uniforms.uRadius, radius);
      gl.uniform1f(this.rippleDropProg.uniforms.uStrength, strength);
      gl.uniform1f(this.rippleDropProg.uniforms.uWaterLevel, this.config.waterLevel);
      this.blit(this.stateFbo.write.fbo, this.stateFbo.width, this.stateFbo.height);
      this.stateFbo.swap();
    } else {
      this.useProgram(this.flowSourceProg);
      this.bindTexture(this.flowSourceProg, 'uHeight', this.stateFbo.read.texture, 0);
      gl.uniform2f(this.flowSourceProg.uniforms.uPoint, u, v);
      gl.uniform1f(this.flowSourceProg.uniforms.uRadius, radius);
      gl.uniform1f(this.flowSourceProg.uniforms.uAmount, Math.abs(strength) * 0.14);
      this.blit(this.stateFbo.write.fbo, this.stateFbo.width, this.stateFbo.height);
      this.stateFbo.swap();
    }
  }

  public step(dtSeconds: number): void {
    if (this.destroyed) return;
    const dt = Math.min(Math.max(dtSeconds, 0.001), 0.033);
    this.elapsed += dt;
    const gl = this.gl;

    if (this.config.mode === 'ripples') {
      // 2 substeps per frame for responsive, silky-smooth wave propagation
      for (let s = 0; s < 2; s += 1) {
        this.useProgram(this.rippleStepProg);
        this.bindTexture(this.rippleStepProg, 'uState', this.stateFbo.read.texture, 0);
        this.bindTexture(this.rippleStepProg, 'uTerrain', this.terrainTexture, 1);
        gl.uniform2f(
          this.rippleStepProg.uniforms.uTexelSize,
          this.stateFbo.texelSizeX,
          this.stateFbo.texelSizeY,
        );
        gl.uniform1f(this.rippleStepProg.uniforms.uWaveSpeed, this.config.waveSpeed);
        gl.uniform1f(this.rippleStepProg.uniforms.uDamping, this.config.damping);
        gl.uniform1f(this.rippleStepProg.uniforms.uWaterLevel, this.config.waterLevel);
        this.blit(this.stateFbo.write.fbo, this.stateFbo.width, this.stateFbo.height);
        this.stateFbo.swap();
      }
    } else {
      // 4 virtual-pipe SWE substeps per frame for fast, stable downhill routing
      const subDt = 0.085 * Math.min(Math.max(this.config.waveSpeed, 0.25), 2.5);
      for (let s = 0; s < 4; s += 1) {
        this.useProgram(this.flowFluxProg);
        this.bindTexture(this.flowFluxProg, 'uHeight', this.stateFbo.read.texture, 0);
        this.bindTexture(this.flowFluxProg, 'uFlux', this.fluxFbo.read.texture, 1);
        this.bindTexture(this.flowFluxProg, 'uTerrain', this.terrainTexture, 2);
        gl.uniform2f(
          this.flowFluxProg.uniforms.uTexelSize,
          this.fluxFbo.texelSizeX,
          this.fluxFbo.texelSizeY,
        );
        gl.uniform1f(this.flowFluxProg.uniforms.uDt, subDt);
        gl.uniform1f(this.flowFluxProg.uniforms.uGravity, 18.0);
        gl.uniform1f(this.flowFluxProg.uniforms.uFriction, this.config.damping * 1.4);
        this.blit(this.fluxFbo.write.fbo, this.fluxFbo.width, this.fluxFbo.height);
        this.fluxFbo.swap();

        this.useProgram(this.flowUpdateProg);
        this.bindTexture(this.flowUpdateProg, 'uHeight', this.stateFbo.read.texture, 0);
        this.bindTexture(this.flowUpdateProg, 'uFlux', this.fluxFbo.read.texture, 1);
        gl.uniform2f(
          this.flowUpdateProg.uniforms.uTexelSize,
          this.stateFbo.texelSizeX,
          this.stateFbo.texelSizeY,
        );
        gl.uniform1f(this.flowUpdateProg.uniforms.uDt, subDt);
        gl.uniform1f(this.flowUpdateProg.uniforms.uEvaporation, 0.0008);
        this.blit(this.stateFbo.write.fbo, this.stateFbo.width, this.stateFbo.height);
        this.stateFbo.swap();
      }
    }

    // Render shaded water surface to offscreen canvas
    this.useProgram(this.displayProg);
    this.bindTexture(this.displayProg, 'uState', this.stateFbo.read.texture, 0);
    this.bindTexture(this.displayProg, 'uTerrain', this.terrainTexture, 1);
    gl.uniform2f(
      this.displayProg.uniforms.uTexelSize,
      this.stateFbo.texelSizeX,
      this.stateFbo.texelSizeY,
    );
    gl.uniform1i(this.displayProg.uniforms.uMode, this.config.mode === 'ripples' ? 0 : 1);
    gl.uniform1f(this.displayProg.uniforms.uWaterLevel, this.config.waterLevel);
    gl.uniform3f(
      this.displayProg.uniforms.uShallowColor,
      this.config.shallowColor[0],
      this.config.shallowColor[1],
      this.config.shallowColor[2],
    );
    gl.uniform3f(
      this.displayProg.uniforms.uDeepColor,
      this.config.deepColor[0],
      this.config.deepColor[1],
      this.config.deepColor[2],
    );
    gl.uniform1f(this.displayProg.uniforms.uSpecularIntensity, this.config.specularIntensity);
    gl.uniform1f(this.displayProg.uniforms.uFoamIntensity, this.config.foamIntensity);
    gl.uniform1f(this.displayProg.uniforms.uTime, this.elapsed);
    this.blit(null, this.width, this.height);
  }

  public clear(): void {
    if (this.destroyed) return;
    const gl = this.gl;
    this.useProgram(this.clearProg);
    gl.uniform4f(this.clearProg.uniforms.uValue, 0, 0, 0, 0);

    for (const dfbo of [this.stateFbo, this.fluxFbo]) {
      this.blit(dfbo.read.fbo, dfbo.width, dfbo.height);
      this.blit(dfbo.write.fbo, dfbo.width, dfbo.height);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;

    for (const dfbo of [this.stateFbo, this.fluxFbo]) {
      gl.deleteFramebuffer(dfbo.read.fbo);
      gl.deleteTexture(dfbo.read.texture);
      gl.deleteFramebuffer(dfbo.write.fbo);
      gl.deleteTexture(dfbo.write.texture);
    }
    gl.deleteTexture(this.terrainTexture);
    for (const prog of [
      this.clearProg,
      this.rippleDropProg,
      this.rippleStepProg,
      this.flowSourceProg,
      this.flowFluxProg,
      this.flowUpdateProg,
      this.displayProg,
    ]) {
      gl.deleteProgram(prog.program);
    }
    gl.deleteBuffer(this.quadVbo);
    gl.deleteVertexArray(this.quadVao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private createProgram(fragSource: string): ShaderProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERT_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL2 program.');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
      gl.deleteProgram(program);
      throw new Error(`ShallowWater shader link failed: ${log}`);
    }

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i += 1) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
    }
    return { program, uniforms };
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create WebGL2 shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Unknown compile error';
      gl.deleteShader(shader);
      throw new Error(`ShallowWater shader compile failed: ${log}`);
    }
    return shader;
  }

  private createFBO(width: number, height: number, filter: number) {
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) throw new Error('Failed to allocate FBO.');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Incomplete FBO: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, fbo };
  }

  private createDoubleFBO(width: number, height: number, filter: number): DoubleFBO {
    let read = this.createFBO(width, height, filter);
    let write = this.createFBO(width, height, filter);
    return {
      width,
      height,
      texelSizeX: 1 / width,
      texelSizeY: 1 / height,
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const tmp = read;
        read = write;
        write = tmp;
      },
    };
  }

  private useProgram(prog: ShaderProgram): void {
    this.gl.useProgram(prog.program);
  }

  private bindTexture(
    prog: ShaderProgram,
    uniformName: string,
    texture: WebGLTexture,
    unit: number,
  ): void {
    const loc = prog.uniforms[uniformName];
    if (!loc) return;
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(loc, unit);
  }

  private blit(targetFbo: WebGLFramebuffer | null, width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, width, height);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
