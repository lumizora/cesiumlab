import type { Primitive, Viewer } from 'cesium';
import type { AnimationClock } from './clock.ts';

export interface EffectBaseOptions {
  /** Initial visibility of the effect. Defaults to true. */
  show?: boolean;
  /** Start with animation paused. Defaults to false. */
  paused?: boolean;
}

export interface EffectHandle<TUpdateOptions = Record<string, never>> {
  /** Show the effect (shorthand for `setVisible(true)`). */
  show(): void;
  /** Hide the effect without releasing GPU resources (shorthand for `setVisible(false)`). */
  hide(): void;
  /** Toggle visibility of the effect. */
  setVisible(visible: boolean): void;
  /** Returns whether the effect is currently visible. */
  isVisible(): boolean;
  /** Update mutable effect parameters at runtime. */
  update(options: TUpdateOptions): void;
  /** Pause or resume the effect's animation clock. */
  setPaused(paused: boolean): void;
  /** Returns whether the animation is currently paused. */
  isPaused(): boolean;
  /** Reset the animation timeline back to t = 0. */
  restart(): void;
  /** Returns whether this effect has been destroyed. */
  isDestroyed(): boolean;
  /** Idempotently release all CesiumJS primitives and listeners created by this effect. */
  destroy(): void;
}

interface PrimitiveEffectLifecycleConfig<TUpdateOptions> {
  viewer: Viewer;
  clock: AnimationClock;
  getPrimitives: () => readonly Primitive[];
  initialShow?: boolean;
  onUpdate: (options: TUpdateOptions) => void;
  onRestart?: () => void;
  onDestroy?: () => void;
}

/**
 * Shared lifecycle implementation for Primitive-based effects.
 * Centralizes visibility, pause/restart, and idempotent destroy logic.
 */
export function createPrimitiveEffectHandle<TUpdateOptions>(
  config: PrimitiveEffectLifecycleConfig<TUpdateOptions>,
): EffectHandle<TUpdateOptions> {
  const { viewer, clock, getPrimitives, onUpdate, onRestart, onDestroy } = config;
  let visible = config.initialShow ?? true;
  let destroyed = false;

  const applyVisibility = (nextVisible: boolean) => {
    for (const primitive of getPrimitives()) {
      primitive.show = nextVisible;
    }
  };

  applyVisibility(visible);

  const setVisible = (nextVisible: boolean) => {
    if (destroyed) return;
    visible = nextVisible;
    applyVisibility(visible);
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
    update(options) {
      if (destroyed) return;
      onUpdate(options);
      applyVisibility(visible);
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
      onRestart?.();
    },
    isDestroyed() {
      return destroyed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      visible = false;
      clock.destroy();
      onDestroy?.();
      if (!viewer.isDestroyed()) {
        for (const primitive of getPrimitives()) {
          viewer.scene.primitives.remove(primitive);
        }
      }
    },
  };
}
