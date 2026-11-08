export interface WebGLSupport {
  supported: boolean;
  reason?: string;
}

/**
 * Checks for a usable WebGL context before Cesium is imported, so unsupported
 * or blocklisted environments get a clear message instead of a blank canvas.
 * The probe context is explicitly released again.
 */
export function detectWebGLSupport(): WebGLSupport {
  if (typeof document === 'undefined') {
    return { supported: false, reason: '当前环境没有可用的 DOM。' };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      return {
        supported: false,
        reason: '浏览器没有提供可用的 WebGL 2 或 WebGL 1 上下文，CesiumJS 无法渲染。',
      };
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : 'WebGL 初始化失败。',
    };
  }
}
