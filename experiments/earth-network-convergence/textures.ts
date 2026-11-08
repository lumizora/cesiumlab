/**
 * Builds a white radial glow sprite at runtime. Billboard color tints it, so
 * the same texture serves gold routes/center and cyan nodes.
 */
export function createRadialGlowTexture(size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create the glow sprite canvas.');
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.48, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.035)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}
