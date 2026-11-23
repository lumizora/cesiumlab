import { Ellipsoid, type Primitive, type Viewer } from 'cesium';
import { describe, expect, it } from 'vite-plus/test';
import {
  createCometArc,
  createEnergyBeam,
  createEnergyWall,
  createHoloDome,
  createPulseRing,
  createRadarScan,
  type EffectHandle,
} from '../src/index.ts';

// Cesium's Material constructor checks browser media globals when inspecting uniforms.
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class {} as unknown as typeof HTMLCanvasElement;
}
if (typeof globalThis.HTMLImageElement === 'undefined') {
  globalThis.HTMLImageElement = class {} as unknown as typeof HTMLImageElement;
}
if (typeof globalThis.HTMLVideoElement === 'undefined') {
  globalThis.HTMLVideoElement = class {} as unknown as typeof HTMLVideoElement;
}
if (typeof globalThis.ImageBitmap === 'undefined') {
  globalThis.ImageBitmap = class {} as unknown as typeof ImageBitmap;
}
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  globalThis.OffscreenCanvas = class {} as unknown as typeof OffscreenCanvas;
}

function createMockViewer() {
  const primitives: Primitive[] = [];
  const preRenderListeners = new Set<() => void>();
  let destroyed = false;

  const viewer = {
    scene: {
      ellipsoid: Ellipsoid.WGS84,
      globe: {
        getHeight: () => 0,
      },
      primitives: {
        add(primitive: Primitive) {
          primitives.push(primitive);
          return primitive;
        },
        remove(primitive: Primitive) {
          const index = primitives.indexOf(primitive);
          if (index !== -1) primitives.splice(index, 1);
          return index !== -1;
        },
      },
      preRender: {
        addEventListener(callback: () => void) {
          preRenderListeners.add(callback);
          return () => {
            preRenderListeners.delete(callback);
          };
        },
      },
    },
    isDestroyed: () => destroyed,
  } as unknown as Viewer;

  return {
    viewer,
    primitives,
    preRenderListeners,
    markDestroyed() {
      destroyed = true;
    },
    tick() {
      for (const listener of preRenderListeners) {
        listener();
      }
    },
  };
}

describe('createCometArc', () => {
  it('creates a single GPU primitive, supports visibility & live updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const arc = createCometArc(mock.viewer, {
      from: [104.07, 30.57],
      to: [121.47, 31.23],
      cometCount: 2,
    });

    expect(mock.primitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(arc.isVisible()).toBe(true);
    expect(arc.isPaused()).toBe(false);
    expect(arc.isDestroyed()).toBe(false);

    arc.hide();
    expect(arc.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    // Updating height swaps the underlying Primitive and must preserve hidden state
    arc.update({ speed: 2, height: 600_000, trailLength: 0.3, cometCount: 3, color: '#00a8ff' });
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    arc.show();
    expect(arc.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    arc.setPaused(true);
    expect(arc.isPaused()).toBe(true);
    mock.tick();

    arc.destroy();
    expect(arc.isDestroyed()).toBe(true);
    expect(arc.isVisible()).toBe(false);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => arc.destroy()).not.toThrow();
  });

  it('rejects invalid, identical, or antipodal coordinates', () => {
    const mock = createMockViewer();
    expect(() => createCometArc(mock.viewer, { from: [200, 0], to: [120, 30] })).toThrow(
      RangeError,
    );
    expect(() => createCometArc(mock.viewer, { from: [120, 30], to: [120, 30] })).toThrow(
      RangeError,
    );
    expect(() => createCometArc(mock.viewer, { from: [0, 0], to: [180, 0] })).toThrow(RangeError);
  });
});

describe('createPulseRing', () => {
  it('supports loop mode, initial show: false, and clean teardown', () => {
    const mock = createMockViewer();
    const ring = createPulseRing(mock.viewer, {
      position: [121.47, 31.23],
      mode: 'loop',
      ringCount: 3,
      show: false,
    });

    expect(mock.primitives.length).toBe(1);
    expect(ring.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    ring.setVisible(true);
    expect(ring.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    ring.update({ maxRadius: 300_000, speed: 1.5, ringCount: 4 });
    ring.setPaused(true);
    expect(ring.isPaused()).toBe(true);

    ring.destroy();
    expect(ring.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
  });

  it('supports trigger mode with GPU uniform bursts and coalesced trigger()', () => {
    const mock = createMockViewer();
    const pulse = createPulseRing(mock.viewer, {
      position: [121.47, 31.23],
      mode: 'trigger',
      ringCount: 2,
    });

    expect(mock.primitives.length).toBe(1);
    pulse.trigger();
    mock.tick();
    pulse.restart();

    pulse.destroy();
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
  });
});

describe('createEnergyBeam', () => {
  it('creates volumetric cylinder & base primitives, supports show/hide, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const beam = createEnergyBeam(mock.viewer, {
      position: [104.07, 30.57],
      height: 520_000,
    });

    expect(mock.primitives.length).toBe(3);
    expect(mock.preRenderListeners.size).toBe(1);

    beam.hide();
    expect(beam.isVisible()).toBe(false);
    expect(mock.primitives.every((p) => p.show === false)).toBe(true);

    beam.show();
    expect(beam.isVisible()).toBe(true);
    expect(mock.primitives.every((p) => p.show === true)).toBe(true);

    beam.update({
      height: 650_000,
      intensity: 1.2,
      coreWidth: 1.1,
      glowWidth: 1.3,
      flowSpeed: 1.5,
    });
    mock.tick();
    beam.setPaused(true);
    expect(beam.isPaused()).toBe(true);

    beam.destroy();
    expect(beam.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => beam.destroy()).not.toThrow();
  });

  it('allows heterogeneous effects to be managed polymorphically via EffectHandle[]', () => {
    const mock = createMockViewer();
    const effects: EffectHandle<never>[] = [
      createCometArc(mock.viewer, { from: [104.07, 30.57], to: [121.47, 31.23] }),
      createPulseRing(mock.viewer, { position: [121.47, 31.23] }),
      createEnergyBeam(mock.viewer, { position: [104.07, 30.57] }),
      createEnergyWall(mock.viewer, {
        positions: [
          [121.4, 31.2],
          [121.5, 31.2],
          [121.5, 31.3],
        ],
      }),
      createRadarScan(mock.viewer, { position: [121.47, 31.23] }),
      createHoloDome(mock.viewer, { position: [121.47, 31.23] }),
    ];

    for (const effect of effects) {
      effect.hide();
      expect(effect.isVisible()).toBe(false);
    }
    expect(mock.primitives.every((p) => p.show === false)).toBe(true);

    for (const effect of effects) {
      effect.destroy();
      expect(effect.isDestroyed()).toBe(true);
    }
    expect(mock.primitives.length).toBe(0);
  });
});

describe('createEnergyWall', () => {
  it('creates a single wall primitive, preserves visibility across geometry updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const wall = createEnergyWall(mock.viewer, {
      positions: [
        [121.42, 31.2],
        [121.52, 31.2],
        [121.52, 31.28],
        [121.42, 31.28],
      ],
      height: 15_000,
    });

    expect(mock.primitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(wall.isVisible()).toBe(true);

    wall.hide();
    expect(wall.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    // Updating height rebuilds the wall Primitive and must preserve hidden state
    wall.update({
      height: 25_000,
      speed: 1.4,
      repeat: 4,
      opacity: 1.1,
      color: '#ff9f1c',
    });
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    wall.show();
    expect(wall.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    wall.setPaused(true);
    expect(wall.isPaused()).toBe(true);
    mock.tick();

    wall.destroy();
    expect(wall.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => wall.destroy()).not.toThrow();
  });

  it('rejects fewer than two wall positions', () => {
    const mock = createMockViewer();
    expect(() => createEnergyWall(mock.viewer, { positions: [[121.47, 31.23]] })).toThrow(
      RangeError,
    );
  });
});

describe('createRadarScan', () => {
  it('creates a single radar primitive, supports live updates and visibility, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const radar = createRadarScan(mock.viewer, {
      position: [121.47, 31.23],
      radius: 120_000,
      show: false,
    });

    expect(mock.primitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(radar.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    radar.setVisible(true);
    expect(radar.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    radar.update({
      radius: 180_000,
      sectorAngle: Math.PI * 0.6,
      speed: 1.5,
      opacity: 0.95,
      color: '#00a8ff',
    });
    mock.tick();
    radar.restart();
    radar.setPaused(true);
    expect(radar.isPaused()).toBe(true);

    radar.destroy();
    expect(radar.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => radar.destroy()).not.toThrow();
  });
});

describe('createHoloDome', () => {
  it('creates a single dome primitive, preserves visibility across radius updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const dome = createHoloDome(mock.viewer, {
      position: [121.47, 31.23],
      radius: 80_000,
    });

    expect(mock.primitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(dome.isVisible()).toBe(true);

    dome.hide();
    expect(dome.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    // Updating radius rebuilds the hemisphere Primitive and must preserve hidden state
    dome.update({
      radius: 120_000,
      heightScale: 0.95,
      gridScale: 18,
      speed: 1.6,
      opacity: 0.95,
      color: '#a855f7',
    });
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    dome.show();
    expect(dome.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    mock.tick();
    dome.setPaused(true);
    expect(dome.isPaused()).toBe(true);

    dome.destroy();
    expect(dome.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => dome.destroy()).not.toThrow();
  });
});
