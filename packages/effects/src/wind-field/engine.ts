/**
 * Offscreen WebGL2 GPU particle streamline & trail-accumulation engine for Wind / Ocean Current fields.
 *
 * Uses high-resolution ping-pong RGBA8 trail FBOs (no EXT_color_buffer_float dependency, 100% WebGL2 compatible)
 * combined with a tight Float32Array bilinear vector-field integrator and a single instanced SDF anti-aliased
 * capsule draw call per frame to render thousands of razor-sharp, speed-colored wind/current streamlines at 60fps.
 */

export type WindFieldPreset = 'typhoon' | 'ocean';
export type WindFieldPalette = 'wind' | 'ocean' | 'thermal';

export interface WindFieldGrid {
  /** Grid columns (longitude samples, >= 2). */
  width: number;
  /** Grid rows (latitude samples, >= 2, row 0 = south, row height-1 = north). */
  height: number;
  /** Eastward velocity component (length = width * height). */
  u: Float32Array;
  /** Northward velocity component (length = width * height). */
  v: Float32Array;
}

export interface WindFieldEngineConfig {
  /** Offscreen trail texture resolution (width & height in pixels). */
  resolution: number;
  /** Number of active streamline particles. */
  particleCount: number;
  /** Anti-aliased streamline width in offscreen texels. */
  lineWidth: number;
  /** Particle advection speed multiplier. */
  speed: number;
  /** Per-frame trail persistence factor in [0.85, 0.992]. Higher = longer trails. */
  fadeOpacity: number;
  /** Speed-to-color ramp palette. */
  palette: WindFieldPalette;
  /** Built-in preset used when no custom `field` is provided. */
  preset: WindFieldPreset;
  /** Optional custom 2D vector field overriding `preset`. */
  field?: WindFieldGrid;
}

interface TrailFbo {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
}

const QUAD_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FADE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform float uFade;
out vec4 fragColor;
void main() {
  vec4 c = texture(uPrev, vUv);
  // Decay both RGB and alpha smoothly; snap residual floor to zero so trails vanish cleanly
  float nextA = c.a * uFade;
  if (nextA < 0.008) {
    fragColor = vec4(0.0);
    return;
  }
  fragColor = vec4(c.rgb * uFade, nextA);
}
`;

const BLIT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUv);
  // Subtle edge feathering around the domain boundary
  vec2 edge = min(vUv, 1.0 - vUv);
  float feather = smoothstep(0.0, 0.035, min(edge.x, edge.y));
  // Un-premultiply slightly for vivid streamline saturation
  vec3 rgb = c.a > 0.01 ? clamp(c.rgb / max(c.a, 0.18), 0.0, 1.0) : vec3(0.0);
  fragColor = vec4(rgb, clamp(c.a * feather, 0.0, 1.0));
}
`;

const CAPSULE_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aCorner;
in vec4 aSeg;
in float aSpeed;
in float aAlpha;
uniform float uResolution;
uniform float uLineWidth;
out vec2 vLocalPos;
out float vHalfLen;
out float vHalfWidth;
out float vSpeed;
out float vAlpha;

void main() {
  vec2 p0 = aSeg.xy * uResolution;
  vec2 p1 = aSeg.zw * uResolution;
  vec2 mid = 0.5 * (p0 + p1);
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 tangent = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-tangent.y, tangent.x);

  float halfLen = 0.5 * len;
  float halfWidth = max(0.55, uLineWidth * 0.5);
  float aaPad = 1.0;

  vec2 local = vec2(
    aCorner.x * (halfLen + halfWidth + aaPad),
    aCorner.y * (halfWidth + aaPad)
  );
  vec2 worldPx = mid + tangent * local.x + normal * local.y;
  vec2 clip = (worldPx / uResolution) * 2.0 - 1.0;

  vLocalPos = local;
  vHalfLen = halfLen;
  vHalfWidth = halfWidth;
  vSpeed = aSpeed;
  vAlpha = aAlpha;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const CAPSULE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocalPos;
in float vHalfLen;
in float vHalfWidth;
in float vSpeed;
in float vAlpha;
uniform vec3 uStop0;
uniform vec3 uStop1;
uniform vec3 uStop2;
uniform vec3 uStop3;
uniform vec3 uStop4;
out vec4 fragColor;

vec3 sampleRamp(float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(uStop0, uStop1, x);
  if (x < 2.0) return mix(uStop1, uStop2, x - 1.0);
  if (x < 3.0) return mix(uStop2, uStop3, x - 2.0);
  return mix(uStop3, uStop4, x - 3.0);
}

void main() {
  // Exact capsule signed distance for smooth anti-aliased ribbons with rounded frame joins
  vec2 q = vec2(max(abs(vLocalPos.x) - vHalfLen, 0.0), vLocalPos.y);
  float dist = length(q);
  float coverage = 1.0 - smoothstep(max(0.0, vHalfWidth - 0.65), vHalfWidth + 0.75, dist);
  if (coverage <= 0.002) discard;

  float along = clamp((vLocalPos.x / max(vHalfLen, 0.5)) * 0.5 + 0.5, 0.0, 1.0);
  float a = clamp(vAlpha * mix(0.75, 1.0, along) * coverage, 0.0, 1.0);
  vec3 rgb = sampleRamp(vSpeed);
  // Premultiplied output for clean additive-free trail blending
  fragColor = vec4(rgb * a, a);
}
`;

const PALETTE_RGB: Record<
  WindFieldPalette,
  readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ]
> = {
  wind: [
    [0.2, 0.45, 0.92],
    [0.06, 0.78, 0.88],
    [0.2, 0.88, 0.55],
    [0.98, 0.82, 0.16],
    [0.96, 0.28, 0.24],
  ],
  ocean: [
    [0.08, 0.25, 0.62],
    [0.04, 0.56, 0.82],
    [0.12, 0.82, 0.88],
    [0.52, 0.96, 0.86],
    [0.94, 0.99, 1.0],
  ],
  thermal: [
    [0.26, 0.12, 0.62],
    [0.64, 0.18, 0.58],
    [0.9, 0.34, 0.28],
    [0.99, 0.68, 0.12],
    [1.0, 0.97, 0.72],
  ],
};

/**
 * Generates realistic analytical 2D vector fields (typhoon cyclone + monsoon or Kuroshio ocean gyre)
 * so the wind/current field looks compelling out of the box with zero external data files.
 */
export function generatePresetVectorField(preset: WindFieldPreset, gridSize = 64): WindFieldGrid {
  const u = new Float32Array(gridSize * gridSize);
  const v = new Float32Array(gridSize * gridSize);

  for (let j = 0; j < gridSize; j += 1) {
    const y = j / (gridSize - 1); // 0 = south, 1 = north
    for (let i = 0; i < gridSize; i += 1) {
      const x = i / (gridSize - 1); // 0 = west, 1 = east

      let vx = 0;
      let vy = 0;

      if (preset === 'typhoon') {
        // Primary counter-clockwise Northern Hemisphere typhoon eye + outer monsoon flow
        const cx1 = 0.56;
        const cy1 = 0.44;
        const dx1 = x - cx1;
        const dy1 = y - cy1;
        const r1 = Math.hypot(dx1, dy1) + 1e-4;
        // Rankine-like tangential wind profile peaking at eyewall r ≈ 0.085
        const eyeRadius = 0.085;
        const tang1 =
          r1 < eyeRadius ? (r1 / eyeRadius) * 1.15 : 1.15 * Math.exp(-((r1 - eyeRadius) / 0.32));
        // Slight inward convergence spiral
        const inflow = 0.18 * tang1;
        vx += (-dy1 / r1) * tang1 - (dx1 / r1) * inflow;
        vy += (dx1 / r1) * tang1 - (dy1 / r1) * inflow;

        // Secondary subtropical high-pressure anticyclone (clockwise) in the northeast
        const cx2 = 0.84;
        const cy2 = 0.78;
        const dx2 = x - cx2;
        const dy2 = y - cy2;
        const r2 = Math.hypot(dx2, dy2) + 1e-4;
        const tang2 = 0.48 * Math.exp(-(r2 / 0.34));
        vx += (dy2 / r2) * tang2;
        vy += (-dx2 / r2) * tang2;

        // Mid-latitude westerlies in the north + trade winds in the south
        vx += 0.34 * Math.sin((y - 0.35) * Math.PI);
        vy += 0.1 * Math.cos(x * Math.PI * 2.2) * Math.sin(y * Math.PI);
      } else {
        // 'ocean': Western boundary Kuroshio Current sweeping northeast + mesoscale eddies
        const jetCenter = 0.24 + 0.56 * Math.pow(y, 0.85) + 0.06 * Math.sin(y * Math.PI * 2.5);
        const distJet = Math.abs(x - jetCenter);
        const jetStrength = 1.12 * Math.exp(-((distJet * distJet) / 0.016));
        const slopeX = 0.58 + 0.12 * Math.cos(y * Math.PI * 2.5);
        const slopeY = 0.82;
        const norm = Math.hypot(slopeX, slopeY);
        vx += (slopeX / norm) * jetStrength;
        vy += (slopeY / norm) * jetStrength;

        // Two mesoscale recirculation eddies flanking the main current
        const e1x = x - 0.64;
        const e1y = y - 0.34;
        const er1 = Math.hypot(e1x, e1y) + 1e-4;
        const et1 = 0.56 * Math.exp(-((er1 - 0.06) * (er1 - 0.06)) / 0.032);
        vx += (e1y / er1) * et1;
        vy += (-e1x / er1) * et1;

        const e2x = x - 0.32;
        const e2y = y - 0.74;
        const er2 = Math.hypot(e2x, e2y) + 1e-4;
        const et2 = 0.46 * Math.exp(-((er2 - 0.05) * (er2 - 0.05)) / 0.028);
        vx += (-e2y / er2) * et2;
        vy += (e2x / er2) * et2;

        // Gentle subtropical background drift
        vx += 0.16 * (0.5 - y);
        vy += 0.12 * (0.5 - x);
      }

      const idx = j * gridSize + i;
      u[idx] = vx;
      v[idx] = vy;
    }
  }

  return { width: gridSize, height: gridSize, u, v };
}

export class WindFieldEngine {
  public readonly canvas: HTMLCanvasElement;
  public readonly resolution: number;

  private readonly gl: WebGL2RenderingContext;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly quadVbo: WebGLBuffer;
  private readonly lineVao: WebGLVertexArrayObject;
  private readonly lineVbo: WebGLBuffer;

  private readonly fadeProg: WebGLProgram;
  private readonly fadeUniforms: {
    uPrev: WebGLUniformLocation | null;
    uFade: WebGLUniformLocation | null;
  };
  private readonly blitProg: WebGLProgram;
  private readonly blitUniforms: { uTex: WebGLUniformLocation | null };
  private readonly lineProg: WebGLProgram;
  private readonly lineUniforms: {
    uResolution: WebGLUniformLocation | null;
    uLineWidth: WebGLUniformLocation | null;
    uStop0: WebGLUniformLocation | null;
    uStop1: WebGLUniformLocation | null;
    uStop2: WebGLUniformLocation | null;
    uStop3: WebGLUniformLocation | null;
    uStop4: WebGLUniformLocation | null;
  };

  private trailRead: TrailFbo;
  private trailWrite: TrailFbo;

  private config: WindFieldEngineConfig;
  private field: WindFieldGrid;
  private maxFieldSpeed = 1;

  // Particle arrays: x, y in [0, 1], age, maxAge
  private px: Float32Array;
  private py: Float32Array;
  private age: Float32Array;
  private maxAge: Float32Array;
  // Per-instance segment data: 6 floats per particle (x0, y0, x1, y1, speedNorm, alpha)
  private instanceData: Float32Array;
  private rngState = 1337;
  private destroyed = false;

  public static create(config: WindFieldEngineConfig): WindFieldEngine | null {
    if (typeof document === 'undefined') return null;
    const res = Math.max(256, Math.min(2048, Math.round(config.resolution)));
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return null;

    try {
      return new WindFieldEngine(canvas, gl, res, config);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    resolution: number,
    config: WindFieldEngineConfig,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.resolution = resolution;
    this.config = { ...config };
    this.field = config.field ?? generatePresetVectorField(config.preset);
    this.maxFieldSpeed = this.computeMaxSpeed(this.field);

    gl.disable(gl.DEPTH_TEST);

    // Fullscreen quad VAO
    const qVao = gl.createVertexArray();
    const qVbo = gl.createBuffer();
    if (!qVao || !qVbo) throw new Error('Failed to create WindField quad buffers.');
    this.quadVao = qVao;
    this.quadVbo = qVbo;
    gl.bindVertexArray(qVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Shaders
    this.fadeProg = this.createProgram(QUAD_VERT, FADE_FRAG, ['aPos']);
    this.fadeUniforms = {
      uPrev: gl.getUniformLocation(this.fadeProg, 'uPrev'),
      uFade: gl.getUniformLocation(this.fadeProg, 'uFade'),
    };
    this.blitProg = this.createProgram(QUAD_VERT, BLIT_FRAG, ['aPos']);
    this.blitUniforms = {
      uTex: gl.getUniformLocation(this.blitProg, 'uTex'),
    };
    this.lineProg = this.createProgram(CAPSULE_VERT, CAPSULE_FRAG, [
      'aCorner',
      'aSeg',
      'aSpeed',
      'aAlpha',
    ]);
    this.lineUniforms = {
      uResolution: gl.getUniformLocation(this.lineProg, 'uResolution'),
      uLineWidth: gl.getUniformLocation(this.lineProg, 'uLineWidth'),
      uStop0: gl.getUniformLocation(this.lineProg, 'uStop0'),
      uStop1: gl.getUniformLocation(this.lineProg, 'uStop1'),
      uStop2: gl.getUniformLocation(this.lineProg, 'uStop2'),
      uStop3: gl.getUniformLocation(this.lineProg, 'uStop3'),
      uStop4: gl.getUniformLocation(this.lineProg, 'uStop4'),
    };

    // Ping-pong trail FBOs
    this.trailRead = this.createTrailFbo(resolution);
    this.trailWrite = this.createTrailFbo(resolution);

    // Dynamic instanced capsule VAO/VBO
    const lVao = gl.createVertexArray();
    const lVbo = gl.createBuffer();
    if (!lVao || !lVbo) throw new Error('Failed to create WindField line buffers.');
    this.lineVao = lVao;
    this.lineVbo = lVbo;

    const count = Math.max(200, Math.min(30_000, Math.round(config.particleCount)));
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.age = new Float32Array(count);
    this.maxAge = new Float32Array(count);
    this.instanceData = new Float32Array(count * 6);

    this.initParticles();
    this.setupLineVao();
    this.clear();
  }

  public updateConfig(patch: Partial<WindFieldEngineConfig>): void {
    if (this.destroyed) return;
    const prevPreset = this.config.preset;
    const prevField = this.config.field;
    const prevCount = this.px.length;

    this.config = { ...this.config, ...patch };

    if (patch.field !== undefined && patch.field !== prevField) {
      this.field = patch.field;
      this.maxFieldSpeed = this.computeMaxSpeed(this.field);
      this.clear();
    } else if (patch.preset !== undefined && patch.preset !== prevPreset && !this.config.field) {
      this.field = generatePresetVectorField(this.config.preset);
      this.maxFieldSpeed = this.computeMaxSpeed(this.field);
      this.clear();
    }

    if (patch.particleCount !== undefined) {
      const nextCount = Math.max(200, Math.min(30_000, Math.round(patch.particleCount)));
      if (nextCount !== prevCount) {
        this.px = new Float32Array(nextCount);
        this.py = new Float32Array(nextCount);
        this.age = new Float32Array(nextCount);
        this.maxAge = new Float32Array(nextCount);
        this.instanceData = new Float32Array(nextCount * 6);
        this.initParticles();
      }
    }
  }

  public step(dtSeconds: number): void {
    if (this.destroyed) return;
    const dt = Math.min(Math.max(dtSeconds, 0.004), 0.033);
    const gl = this.gl;

    // 1. Fade previous trail FBO into trailWrite
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailWrite.fbo);
    gl.viewport(0, 0, this.resolution, this.resolution);
    gl.useProgram(this.fadeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trailRead.texture);
    gl.uniform1i(this.fadeUniforms.uPrev, 0);
    gl.uniform1f(this.fadeUniforms.uFade, Math.max(0.84, Math.min(0.992, this.config.fadeOpacity)));
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Advect particles & build instanced capsule segments (prev -> next)
    const count = this.px.length;
    const advectScale = dt * 0.115 * this.config.speed;
    const invMax = 1 / Math.max(this.maxFieldSpeed, 1e-4);
    const inst = this.instanceData;
    let segCount = 0;

    for (let i = 0; i < count; i += 1) {
      let x = this.px[i]!;
      let y = this.py[i]!;
      let a = this.age[i]! + dt;
      const ma = this.maxAge[i]!;

      const [vx, vy] = this.sampleField(x, y);
      const speedMag = Math.hypot(vx, vy);
      const nx = x + vx * advectScale;
      const ny = y + vy * advectScale;

      const outOfBounds = nx < 0.002 || nx > 0.998 || ny < 0.002 || ny > 0.998;
      if (a >= ma || outOfBounds || speedMag < 1e-4) {
        this.respawnParticle(i);
        continue;
      }

      this.px[i] = nx;
      this.py[i] = ny;
      this.age[i] = a;

      const speedNorm = Math.min(1, Math.pow(speedMag * invMax, 0.78));
      // Smooth fade-in and fade-out over particle lifetime
      const lifeFrac = a / ma;
      const lifeAlpha = Math.sin(lifeFrac * Math.PI) * (0.45 + 0.55 * speedNorm);

      const base = segCount * 6;
      inst[base] = x;
      inst[base + 1] = y;
      inst[base + 2] = nx;
      inst[base + 3] = ny;
      inst[base + 4] = speedNorm;
      inst[base + 5] = lifeAlpha;
      segCount += 1;
    }

    // 3. Draw anti-aliased SDF capsule segments onto trailWrite in a single instanced call
    if (segCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.lineProg);

      const ramp = PALETTE_RGB[this.config.palette];
      gl.uniform1f(this.lineUniforms.uResolution, this.resolution);
      gl.uniform1f(this.lineUniforms.uLineWidth, Math.max(0.8, Math.min(6, this.config.lineWidth)));
      gl.uniform3f(this.lineUniforms.uStop0, ramp[0][0], ramp[0][1], ramp[0][2]);
      gl.uniform3f(this.lineUniforms.uStop1, ramp[1][0], ramp[1][1], ramp[1][2]);
      gl.uniform3f(this.lineUniforms.uStop2, ramp[2][0], ramp[2][1], ramp[2][2]);
      gl.uniform3f(this.lineUniforms.uStop3, ramp[3][0], ramp[3][1], ramp[3][2]);
      gl.uniform3f(this.lineUniforms.uStop4, ramp[4][0], ramp[4][1], ramp[4][2]);

      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
      gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, segCount * 6), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }

    // Swap trail FBOs
    const tmp = this.trailRead;
    this.trailRead = this.trailWrite;
    this.trailWrite = tmp;

    // 4. Blit trailRead to offscreen canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.resolution, this.resolution);
    gl.useProgram(this.blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trailRead.texture);
    gl.uniform1i(this.blitUniforms.uTex, 0);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  public clear(): void {
    if (this.destroyed) return;
    const gl = this.gl;
    for (const fbo of [this.trailRead.fbo, this.trailWrite.fbo, null]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, this.resolution, this.resolution);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    gl.deleteFramebuffer(this.trailRead.fbo);
    gl.deleteTexture(this.trailRead.texture);
    gl.deleteFramebuffer(this.trailWrite.fbo);
    gl.deleteTexture(this.trailWrite.texture);
    gl.deleteProgram(this.fadeProg);
    gl.deleteProgram(this.blitProg);
    gl.deleteProgram(this.lineProg);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteBuffer(this.lineVbo);
    gl.deleteVertexArray(this.lineVao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private rand(): number {
    // Fast deterministic xorshift32
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return (x >>> 0) / 4294967296;
  }

  private initParticles(): void {
    for (let i = 0; i < this.px.length; i += 1) {
      this.respawnParticle(i);
      this.age[i] = this.rand() * this.maxAge[i]!;
    }
  }

  private respawnParticle(i: number): void {
    this.px[i] = 0.01 + this.rand() * 0.98;
    this.py[i] = 0.01 + this.rand() * 0.98;
    this.age[i] = 0;
    this.maxAge[i] = 1.4 + this.rand() * 2.4;
  }

  private computeMaxSpeed(field: WindFieldGrid): number {
    let maxS = 1e-4;
    for (let i = 0; i < field.u.length; i += 1) {
      const s = Math.hypot(field.u[i]!, field.v[i]!);
      if (s > maxS) maxS = s;
    }
    return maxS;
  }

  private sampleField(uNorm: number, vNorm: number): readonly [number, number] {
    const { width, height, u, v } = this.field;
    const fx = Math.max(0, Math.min(width - 1.0001, uNorm * (width - 1)));
    const fy = Math.max(0, Math.min(height - 1.0001, vNorm * (height - 1)));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;

    const u0 = u[i00]! * (1 - tx) + u[i10]! * tx;
    const u1 = u[i01]! * (1 - tx) + u[i11]! * tx;
    const v0 = v[i00]! * (1 - tx) + v[i10]! * tx;
    const v1 = v[i01]! * (1 - tx) + v[i11]! * tx;

    return [u0 * (1 - ty) + u1 * ty, v0 * (1 - ty) + v1 * ty];
  }

  private setupLineVao(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.lineVao);

    // Location 0: shared unit quad corners (per-vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    // Locations 1..3: per-instance segment attributes (x0, y0, x1, y1, speedNorm, alpha)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    const stride = 6 * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  private createTrailFbo(size: number): TrailFbo {
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) throw new Error('Failed to create WindField FBO.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, fbo };
  }

  private createProgram(vsSrc: string, fsSrc: string, attribs: readonly string[]): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('Failed to create WindField WebGL2 program.');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    for (let i = 0; i < attribs.length; i += 1) {
      gl.bindAttribLocation(prog, i, attribs[i]!);
    }
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? 'Unknown link error';
      gl.deleteProgram(prog);
      throw new Error(`WindField shader link failed: ${log}`);
    }
    return prog;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create WindField shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Unknown compile error';
      gl.deleteShader(shader);
      throw new Error(`WindField shader compile failed: ${log}`);
    }
    return shader;
  }
}
