export interface FluidSolverParams {
  curl: number;
  velocityDissipation: number;
  dyeDissipation: number;
  splatRadius: number;
  pressureIterations: number;
}

interface Fbo {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

interface DoubleFbo {
  width: number;
  height: number;
  read: Fbo;
  write: Fbo;
  swap(): void;
}

const BASE_VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const SPLAT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_target;
uniform float u_aspect;
uniform vec2 u_point;
uniform vec3 u_value;
uniform float u_radius;
void main() {
  vec2 p = v_uv - u_point;
  p.x *= u_aspect;
  vec3 splat = exp(-dot(p, p) / max(1e-6, u_radius)) * u_value;
  vec3 base = texture(u_target, v_uv).xyz;
  outColor = vec4(base + splat, 1.0);
}
`;

const CURL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
void main() {
  float L = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).y;
  float R = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).y;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).x;
  float vorticity = 0.5 * (R - L - T + B);
  outColor = vec4(vorticity, 0.0, 0.0, 1.0);
}
`;

const VORTICITY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texelSize;
uniform float u_curlStrength;
uniform float u_dt;
void main() {
  float L = texture(u_curl, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_curl, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_curl, v_uv - vec2(0.0, u_texelSize.y)).x;
  float C = texture(u_curl, v_uv).x;

  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= u_curlStrength * C;
  force.y *= -1.0;

  vec2 vel = texture(u_velocity, v_uv).xy + force * u_dt;
  vel = clamp(vel, vec2(-1000.0), vec2(1000.0));
  outColor = vec4(vel, 0.0, 1.0);
}
`;

const DIVERGENCE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
void main() {
  vec2 vL = v_uv - vec2(u_texelSize.x, 0.0);
  vec2 vR = v_uv + vec2(u_texelSize.x, 0.0);
  vec2 vT = v_uv + vec2(0.0, u_texelSize.y);
  vec2 vB = v_uv - vec2(0.0, u_texelSize.y);

  vec2 C = texture(u_velocity, v_uv).xy;
  float L = vL.x < 0.0 ? -C.x : texture(u_velocity, vL).x;
  float R = vR.x > 1.0 ? -C.x : texture(u_velocity, vR).x;
  float T = vT.y > 1.0 ? -C.y : texture(u_velocity, vT).y;
  float B = vB.y < 0.0 ? -C.y : texture(u_velocity, vB).y;

  float div = 0.5 * (R - L + T - B);
  outColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;
void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, v_uv).x;
  float pressure = (L + R + B + T - div) * 0.25;
  outColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  vec2 vel = texture(u_velocity, v_uv).xy - vec2(R - L, T - B);
  outColor = vec4(vel, 0.0, 1.0);
}
`;

const ADVECTION_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;
void main() {
  vec2 coord = v_uv - u_dt * texture(u_velocity, v_uv).xy * u_texelSize;
  vec4 result = texture(u_source, coord);
  float decay = 1.0 + u_dissipation * u_dt;
  outColor = result / decay;
}
`;

const DISPLAY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_dye;
uniform vec2 u_texelSize;
void main() {
  vec3 c = texture(u_dye, v_uv).rgb;

  // Subtle shading from dye density gradient gives silky 3D fluid relief.
  vec3 lc = texture(u_dye, v_uv - vec2(u_texelSize.x, 0.0)).rgb;
  vec3 rc = texture(u_dye, v_uv + vec2(u_texelSize.x, 0.0)).rgb;
  vec3 tc = texture(u_dye, v_uv + vec2(0.0, u_texelSize.y)).rgb;
  vec3 bc = texture(u_dye, v_uv - vec2(0.0, u_texelSize.y)).rgb;

  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);
  vec3 normal = normalize(vec3(dx, dy, 0.18));
  float sheen = clamp(dot(normal, normalize(vec3(0.4, 0.5, 1.0))), 0.65, 1.28);

  // Soft rectangular edge feathering so the fluid field blends seamlessly onto the globe.
  float edgeX = smoothstep(0.0, 0.06, v_uv.x) * smoothstep(1.0, 0.94, v_uv.x);
  float edgeY = smoothstep(0.0, 0.06, v_uv.y) * smoothstep(1.0, 0.94, v_uv.y);
  float edgeMask = edgeX * edgeY;

  vec3 shaded = c * sheen;
  float alpha = clamp(max(shaded.r, max(shaded.g, shaded.b)) * 1.15, 0.0, 0.96) * edgeMask;
  // Tone-map gently so intense vortex cores glow without harsh clipping.
  vec3 tone = shaded / (vec3(1.0) + shaded * 0.35);
  outColor = vec4(tone, alpha);
}
`;

const CLEAR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_target;
uniform float u_value;
void main() {
  outColor = u_value * texture(u_target, v_uv);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create WebGL2 shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`Fluid shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> } {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error('Failed to create WebGL2 program.');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(`Fluid program link error: ${log}`);
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

export class NavierStokesSolver {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly simWidth: number;
  private readonly simHeight: number;
  private readonly dyeWidth: number;
  private readonly dyeHeight: number;
  private readonly velocity: DoubleFbo;
  private readonly dye: DoubleFbo;
  private readonly divergence: Fbo;
  private readonly curlFbo: Fbo;
  private readonly pressure: DoubleFbo;
  private readonly programs: {
    splat: ReturnType<typeof createProgram>;
    curl: ReturnType<typeof createProgram>;
    vorticity: ReturnType<typeof createProgram>;
    divergence: ReturnType<typeof createProgram>;
    pressure: ReturnType<typeof createProgram>;
    gradientSubtract: ReturnType<typeof createProgram>;
    advection: ReturnType<typeof createProgram>;
    display: ReturnType<typeof createProgram>;
    clear: ReturnType<typeof createProgram>;
  };
  private destroyed = false;

  static create(simResolution: number, aspect: number): NavierStokesSolver | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const safeAspect = Math.max(0.4, Math.min(2.5, aspect));
    const dyeHeight = Math.min(512, Math.max(128, Math.round(simResolution * 2)));
    const dyeWidth = Math.min(512, Math.max(128, Math.round(dyeHeight * safeAspect)));
    canvas.width = dyeWidth;
    canvas.height = dyeHeight;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return null;

    const hasColorBufferFloat =
      Boolean(gl.getExtension('EXT_color_buffer_float')) ||
      Boolean(gl.getExtension('EXT_color_buffer_half_float'));
    if (!hasColorBufferFloat) return null;
    gl.getExtension('OES_texture_float_linear');

    const simHeight = Math.max(64, Math.round(simResolution));
    const simWidth = Math.max(64, Math.round(simHeight * safeAspect));

    try {
      return new NavierStokesSolver(canvas, gl, simWidth, simHeight, dyeWidth, dyeHeight);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    simWidth: number,
    simHeight: number,
    dyeWidth: number,
    dyeHeight: number,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.simWidth = simWidth;
    this.simHeight = simHeight;
    this.dyeWidth = dyeWidth;
    this.dyeHeight = dyeHeight;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) {
      throw new Error('Failed to create fullscreen quad buffers.');
    }
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.programs = {
      splat: createProgram(gl, BASE_VS, SPLAT_FS),
      curl: createProgram(gl, BASE_VS, CURL_FS),
      vorticity: createProgram(gl, BASE_VS, VORTICITY_FS),
      divergence: createProgram(gl, BASE_VS, DIVERGENCE_FS),
      pressure: createProgram(gl, BASE_VS, PRESSURE_FS),
      gradientSubtract: createProgram(gl, BASE_VS, GRADIENT_SUBTRACT_FS),
      advection: createProgram(gl, BASE_VS, ADVECTION_FS),
      display: createProgram(gl, BASE_VS, DISPLAY_FS),
      clear: createProgram(gl, BASE_VS, CLEAR_FS),
    };

    const filter = gl.LINEAR;
    this.velocity = this.createDoubleFbo(simWidth, simHeight, filter);
    this.dye = this.createDoubleFbo(dyeWidth, dyeHeight, filter);
    this.divergence = this.createFbo(simWidth, simHeight, gl.NEAREST);
    this.curlFbo = this.createFbo(simWidth, simHeight, gl.NEAREST);
    this.pressure = this.createDoubleFbo(simWidth, simHeight, gl.NEAREST);
  }

  private createFbo(width: number, height: number, filter: number): Fbo {
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) {
      throw new Error('Failed to create FBO.');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, fbo, width, height };
  }

  private createDoubleFbo(width: number, height: number, filter: number): DoubleFbo {
    let fboA = this.createFbo(width, height, filter);
    let fboB = this.createFbo(width, height, filter);
    return {
      width,
      height,
      get read() {
        return fboA;
      },
      get write() {
        return fboB;
      },
      swap() {
        const tmp = fboA;
        fboA = fboB;
        fboB = tmp;
      },
    };
  }

  private blit(target: Fbo | null) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.dyeWidth, this.dyeHeight);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindTex(unit: number, texture: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  splat(
    u: number,
    v: number,
    vx: number,
    vy: number,
    rgb: readonly [number, number, number],
    radius: number,
  ) {
    if (this.destroyed) return;
    const gl = this.gl;
    const aspect = this.dyeWidth / this.dyeHeight;
    const { program, uniforms } = this.programs.splat;

    gl.useProgram(program);
    gl.uniform1f(uniforms.u_aspect ?? null, aspect);
    gl.uniform2f(uniforms.u_point ?? null, u, v);
    gl.uniform1f(uniforms.u_radius ?? null, radius);

    // Inject velocity impulse
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(uniforms.u_target ?? null, 0);
    gl.uniform3f(uniforms.u_value ?? null, vx, vy, 0);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Inject colored dye
    this.bindTex(0, this.dye.read.texture);
    gl.uniform1i(uniforms.u_target ?? null, 0);
    gl.uniform3f(uniforms.u_value ?? null, rgb[0], rgb[1], rgb[2]);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  step(dt: number, params: FluidSolverParams) {
    if (this.destroyed) return;
    const gl = this.gl;
    const clampedDt = Math.min(0.033, Math.max(0.001, dt));
    const simTexelX = 1 / this.simWidth;
    const simTexelY = 1 / this.simHeight;
    const dyeTexelX = 1 / this.dyeWidth;
    const dyeTexelY = 1 / this.dyeHeight;

    // 1. Curl
    gl.useProgram(this.programs.curl.program);
    gl.uniform2f(this.programs.curl.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(this.programs.curl.uniforms.u_velocity ?? null, 0);
    this.blit(this.curlFbo);

    // 2. Vorticity confinement
    gl.useProgram(this.programs.vorticity.program);
    gl.uniform2f(this.programs.vorticity.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(this.programs.vorticity.uniforms.u_velocity ?? null, 0);
    this.bindTex(1, this.curlFbo.texture);
    gl.uniform1i(this.programs.vorticity.uniforms.u_curl ?? null, 1);
    gl.uniform1f(this.programs.vorticity.uniforms.u_curlStrength ?? null, params.curl);
    gl.uniform1f(this.programs.vorticity.uniforms.u_dt ?? null, clampedDt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 3. Divergence
    gl.useProgram(this.programs.divergence.program);
    gl.uniform2f(this.programs.divergence.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(this.programs.divergence.uniforms.u_velocity ?? null, 0);
    this.blit(this.divergence);

    // 4. Damp previous pressure for warm-started Jacobi solve
    gl.useProgram(this.programs.clear.program);
    this.bindTex(0, this.pressure.read.texture);
    gl.uniform1i(this.programs.clear.uniforms.u_target ?? null, 0);
    gl.uniform1f(this.programs.clear.uniforms.u_value ?? null, 0.8);
    this.blit(this.pressure.write);
    this.pressure.swap();

    // 5. Pressure Poisson Jacobi iterations
    gl.useProgram(this.programs.pressure.program);
    gl.uniform2f(this.programs.pressure.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.divergence.texture);
    gl.uniform1i(this.programs.pressure.uniforms.u_divergence ?? null, 0);
    for (let i = 0; i < params.pressureIterations; i += 1) {
      this.bindTex(1, this.pressure.read.texture);
      gl.uniform1i(this.programs.pressure.uniforms.u_pressure ?? null, 1);
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    // 6. Gradient subtraction (enforce incompressibility)
    gl.useProgram(this.programs.gradientSubtract.program);
    gl.uniform2f(this.programs.gradientSubtract.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.pressure.read.texture);
    gl.uniform1i(this.programs.gradientSubtract.uniforms.u_pressure ?? null, 0);
    this.bindTex(1, this.velocity.read.texture);
    gl.uniform1i(this.programs.gradientSubtract.uniforms.u_velocity ?? null, 1);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 7. Velocity advection
    gl.useProgram(this.programs.advection.program);
    gl.uniform2f(this.programs.advection.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(this.programs.advection.uniforms.u_velocity ?? null, 0);
    gl.uniform1i(this.programs.advection.uniforms.u_source ?? null, 0);
    gl.uniform1f(this.programs.advection.uniforms.u_dt ?? null, clampedDt);
    gl.uniform1f(
      this.programs.advection.uniforms.u_dissipation ?? null,
      params.velocityDissipation,
    );
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 8. Dye advection
    gl.uniform2f(this.programs.advection.uniforms.u_texelSize ?? null, simTexelX, simTexelY);
    this.bindTex(0, this.velocity.read.texture);
    gl.uniform1i(this.programs.advection.uniforms.u_velocity ?? null, 0);
    this.bindTex(1, this.dye.read.texture);
    gl.uniform1i(this.programs.advection.uniforms.u_source ?? null, 1);
    gl.uniform1f(this.programs.advection.uniforms.u_dissipation ?? null, params.dyeDissipation);
    this.blit(this.dye.write);
    this.dye.swap();

    // 9. Present shaded dye field to offscreen canvas
    gl.useProgram(this.programs.display.program);
    gl.uniform2f(this.programs.display.uniforms.u_texelSize ?? null, dyeTexelX, dyeTexelY);
    this.bindTex(0, this.dye.read.texture);
    gl.uniform1i(this.programs.display.uniforms.u_dye ?? null, 0);
    this.blit(null);
  }

  clear() {
    if (this.destroyed) return;
    const gl = this.gl;
    const targets = [
      this.velocity.read,
      this.velocity.write,
      this.dye.read,
      this.dye.write,
      this.pressure.read,
      this.pressure.write,
      this.divergence,
      this.curlFbo,
    ];
    for (const target of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.dyeWidth, this.dyeHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    const fbos = [
      this.velocity.read,
      this.velocity.write,
      this.dye.read,
      this.dye.write,
      this.pressure.read,
      this.pressure.write,
      this.divergence,
      this.curlFbo,
    ];
    for (const item of fbos) {
      gl.deleteFramebuffer(item.fbo);
      gl.deleteTexture(item.texture);
    }
    for (const prog of Object.values(this.programs)) {
      gl.deleteProgram(prog.program);
    }
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
  }
}
