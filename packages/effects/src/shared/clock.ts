import type { Viewer } from 'cesium';

export interface AnimationClock {
  elapsed(): number;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  restart(): void;
  destroy(): void;
}

/**
 * Independent scene.preRender animation clock so effects animate out of the box
 * regardless of viewer.clock.shouldAnimate, while still supporting pause/restart.
 */
export function createAnimationClock(
  viewer: Viewer,
  initialPaused = false,
  onTick?: (elapsedSeconds: number, deltaSeconds: number) => void,
): AnimationClock {
  let elapsedSeconds = 0;
  let lastFrameTime = performance.now();
  let paused = initialPaused;
  let disposed = false;

  const removePreRender = viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    const delta = Math.max(0, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (!paused) {
      elapsedSeconds += delta;
      onTick?.(elapsedSeconds, delta);
    }
  });

  return {
    elapsed() {
      return elapsedSeconds;
    },
    setPaused(value: boolean) {
      if (value === paused) return;
      paused = value;
      lastFrameTime = performance.now();
    },
    isPaused() {
      return paused;
    },
    restart() {
      elapsedSeconds = 0;
      lastFrameTime = performance.now();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      removePreRender();
    },
  };
}
