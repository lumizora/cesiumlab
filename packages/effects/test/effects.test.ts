import * as Cesium from 'cesium';
import {
  Ellipsoid,
  type GroundPolylinePrimitive,
  type GroundPrimitive,
  type PostProcessStage,
  type Primitive,
  type Viewer,
} from 'cesium';
import { describe, expect, it } from 'vite-plus/test';
import {
  createCometArc,
  createEnergyBeam,
  createEnergyWall,
  createGroundFlowPath,
  createHoloBeacon,
  createHoloDome,
  createPulseRing,
  createRadarScan,
  createWaterSurface,
  createWeatherOverlay,
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
// GroundPolylinePrimitive validates RenderState.lineWidth against WebGL ContextLimits.
const contextLimits = (
  Cesium as unknown as {
    ContextLimits?: { _minimumAliasedLineWidth?: number; _maximumAliasedLineWidth?: number };
  }
).ContextLimits;
if (contextLimits && (contextLimits._maximumAliasedLineWidth ?? 0) < 1) {
  contextLimits._minimumAliasedLineWidth = 1;
  contextLimits._maximumAliasedLineWidth = 1;
}

function createMockViewer() {
  const primitives: Primitive[] = [];
  const groundPrimitives: (GroundPrimitive | GroundPolylinePrimitive)[] = [];
  const postProcessStages: PostProcessStage[] = [];
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
      groundPrimitives: {
        add(primitive: GroundPrimitive | GroundPolylinePrimitive) {
          groundPrimitives.push(primitive);
          return primitive;
        },
        remove(primitive: GroundPrimitive | GroundPolylinePrimitive) {
          const index = groundPrimitives.indexOf(primitive);
          if (index !== -1) groundPrimitives.splice(index, 1);
          return index !== -1;
        },
      },
      postProcessStages: {
        add(stage: PostProcessStage) {
          postProcessStages.push(stage);
          return stage;
        },
        remove(stage: PostProcessStage) {
          const index = postProcessStages.indexOf(stage);
          if (index !== -1) postProcessStages.splice(index, 1);
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
    groundPrimitives,
    postProcessStages,
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

    expect(mock.groundPrimitives.length).toBe(1);
    expect(ring.isVisible()).toBe(false);
    expect(mock.groundPrimitives[0]?.show).toBe(false);

    ring.setVisible(true);
    expect(ring.isVisible()).toBe(true);
    expect(mock.groundPrimitives[0]?.show).toBe(true);

    ring.update({ maxRadius: 300_000, speed: 1.5, ringCount: 4 });
    ring.setPaused(true);
    expect(ring.isPaused()).toBe(true);

    ring.destroy();
    expect(ring.isDestroyed()).toBe(true);
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
  });

  it('supports trigger mode with GPU uniform bursts and coalesced trigger()', () => {
    const mock = createMockViewer();
    const pulse = createPulseRing(mock.viewer, {
      position: [121.47, 31.23],
      mode: 'trigger',
      ringCount: 2,
    });

    expect(mock.groundPrimitives.length).toBe(1);
    pulse.trigger();
    mock.tick();
    pulse.restart();

    pulse.destroy();
    expect(mock.groundPrimitives.length).toBe(0);
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
      createHoloBeacon(mock.viewer, { position: [121.47, 31.23] }),
      createWaterSurface(mock.viewer, {
        positions: [
          [120.0, 31.3],
          [120.4, 31.3],
          [120.2, 31.0],
        ],
      }),
      createGroundFlowPath(mock.viewer, {
        positions: [
          [103.62, 30.98],
          [104.07, 30.66],
        ],
      }),
      createWeatherOverlay(mock.viewer, { mode: 'rain' }),
    ];

    for (const effect of effects) {
      effect.hide();
      expect(effect.isVisible()).toBe(false);
    }
    expect(mock.primitives.every((p) => p.show === false)).toBe(true);
    expect(mock.groundPrimitives.every((p) => p.show === false)).toBe(true);
    expect(mock.postProcessStages.every((s) => s.enabled === false)).toBe(true);

    for (const effect of effects) {
      effect.destroy();
      expect(effect.isDestroyed()).toBe(true);
    }
    expect(mock.primitives.length).toBe(0);
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.postProcessStages.length).toBe(0);
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

    expect(mock.groundPrimitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(radar.isVisible()).toBe(false);
    expect(mock.groundPrimitives[0]?.show).toBe(false);

    radar.setVisible(true);
    expect(radar.isVisible()).toBe(true);
    expect(mock.groundPrimitives[0]?.show).toBe(true);

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
    expect(mock.groundPrimitives.length).toBe(0);
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

describe('createGroundFlowPath', () => {
  it('adds a GroundPolylinePrimitive to groundPrimitives, supports live updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const path = createGroundFlowPath(mock.viewer, {
      positions: [
        [103.62, 30.98],
        [104.07, 30.66],
        [104.62, 30.42],
      ],
      width: 12,
      show: false,
    });

    expect(mock.groundPrimitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(path.isVisible()).toBe(false);
    expect(mock.groundPrimitives[0]?.show).toBe(false);

    path.show();
    expect(path.isVisible()).toBe(true);
    expect(mock.groundPrimitives[0]?.show).toBe(true);

    path.update({
      color: '#38bdf8',
      speed: 1.8,
      pulseCount: 5,
      trailLength: 0.65,
      baseOpacity: 0.5,
      brightness: 1.3,
      reverse: true,
    });
    mock.tick();
    path.restart();
    path.setPaused(true);
    expect(path.isPaused()).toBe(true);

    path.destroy();
    expect(path.isDestroyed()).toBe(true);
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => path.destroy()).not.toThrow();
  });

  it('rejects fewer than two path positions', () => {
    const mock = createMockViewer();
    expect(() => createGroundFlowPath(mock.viewer, { positions: [[104.07, 30.66]] })).toThrow(
      RangeError,
    );
  });
});

describe('createHoloBeacon', () => {
  it('creates crystal, tether, and ground ring primitives, supports live updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const beacon = createHoloBeacon(mock.viewer, {
      position: [121.47, 31.23],
      altitude: 120_000,
      size: 28_000,
      show: false,
    });

    expect(mock.primitives.length).toBe(3);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(beacon.isVisible()).toBe(false);
    expect(mock.primitives.every((p) => p.show === false)).toBe(true);

    beacon.show();
    expect(beacon.isVisible()).toBe(true);
    expect(mock.primitives.every((p) => p.show === true)).toBe(true);

    beacon.update({
      color: '#00e5a0',
      altitude: 160_000,
      size: 32_000,
      ringRadius: 72_000,
      spinSpeed: 1.5,
      bobSpeed: 1.2,
      bobAmplitude: 0.4,
      opacity: 1,
    });
    mock.tick();
    beacon.restart();
    beacon.setPaused(true);
    expect(beacon.isPaused()).toBe(true);

    beacon.destroy();
    expect(beacon.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => beacon.destroy()).not.toThrow();
  });
});

describe('createWaterSurface', () => {
  it('creates a polygon water primitive, preserves visibility across height updates, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const water = createWaterSurface(mock.viewer, {
      positions: [
        [120.02, 31.34],
        [120.38, 31.36],
        [120.46, 31.02],
        [120.12, 30.94],
      ],
      height: 60,
    });

    expect(mock.primitives.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(water.isVisible()).toBe(true);

    water.hide();
    expect(water.isVisible()).toBe(false);
    expect(mock.primitives[0]?.show).toBe(false);

    // Updating height rebuilds the water Primitive and must preserve hidden state
    water.update({
      color: '#0284c7',
      specularColor: '#ffffff',
      height: 180,
      waveScale: 1.5,
      amplitude: 0.75,
      speed: 1.4,
      flowSpeed: 0.8,
      flowAngle: 1.2,
      specularIntensity: 1.1,
      opacity: 0.85,
    });
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    water.show();
    expect(water.isVisible()).toBe(true);
    expect(mock.primitives[0]?.show).toBe(true);

    mock.tick();
    water.restart();
    water.setPaused(true);
    expect(water.isPaused()).toBe(true);

    water.destroy();
    expect(water.isDestroyed()).toBe(true);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => water.destroy()).not.toThrow();
  });

  it('rejects fewer than three polygon vertices', () => {
    const mock = createMockViewer();
    expect(() =>
      createWaterSurface(mock.viewer, {
        positions: [
          [120.0, 31.3],
          [120.4, 31.3],
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe('createWeatherOverlay', () => {
  it('adds a PostProcessStage, switches rain/snow/fog modes live, and cleans up idempotently', () => {
    const mock = createMockViewer();
    const weather = createWeatherOverlay(mock.viewer, {
      mode: 'rain',
      intensity: 0.8,
      show: false,
    });

    expect(mock.postProcessStages.length).toBe(1);
    expect(mock.preRenderListeners.size).toBe(1);
    expect(weather.isVisible()).toBe(false);
    expect(mock.postProcessStages[0]?.enabled).toBe(false);

    weather.show();
    expect(weather.isVisible()).toBe(true);
    expect(mock.postProcessStages[0]?.enabled).toBe(true);

    weather.update({ mode: 'snow', intensity: 1.1, speed: 1.3, wind: -0.3 });
    mock.tick();
    weather.update({ mode: 'fog', fogVisibility: 12_000, color: '#cbd5e1' });
    weather.restart();
    weather.setPaused(true);
    expect(weather.isPaused()).toBe(true);

    weather.destroy();
    expect(weather.isDestroyed()).toBe(true);
    expect(mock.postProcessStages.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
    expect(() => weather.destroy()).not.toThrow();
  });
});

describe('GroundPrimitive terrain clamping (clampToGround)', () => {
  it('seamlessly switches RadarScan, PulseRing, and WaterSurface between GroundPrimitive and Primitive', () => {
    const mock = createMockViewer();
    const radar = createRadarScan(mock.viewer, {
      position: [101.96, 29.6],
      radius: 22_000,
      clampToGround: true,
    });
    const pulse = createPulseRing(mock.viewer, {
      position: [102.9, 31.1],
      maxRadius: 24_000,
      clampToGround: true,
    });
    const water = createWaterSurface(mock.viewer, {
      positions: [
        [103.52, 31.52],
        [103.68, 31.52],
        [103.68, 31.38],
        [103.52, 31.38],
      ],
      clampToGround: true,
    });

    expect(mock.groundPrimitives.length).toBe(3);
    expect(mock.primitives.length).toBe(0);

    // Hide all, switch to non-clamped Primitive, verify collection swap & hidden state preserved
    radar.hide();
    pulse.hide();
    water.hide();

    radar.update({ clampToGround: false });
    pulse.update({ clampToGround: false });
    water.update({ clampToGround: false, height: 1_620 });
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.primitives.length).toBe(3);
    expect(mock.primitives.every((p) => p.show === false)).toBe(true);

    // Switch back to GroundPrimitive
    radar.update({ clampToGround: true, radius: 30_000 });
    pulse.update({ clampToGround: true, maxRadius: 32_000 });
    water.update({ clampToGround: true });
    expect(mock.groundPrimitives.length).toBe(3);
    expect(mock.primitives.length).toBe(0);
    expect(mock.groundPrimitives.every((p) => p.show === false)).toBe(true);

    radar.destroy();
    pulse.destroy();
    water.destroy();
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
  });

  it('batches multi-path road networks into a single GroundPolylinePrimitive or Primitive and toggles clampToGround seamlessly', () => {
    const mock = createMockViewer();
    const roadNetwork = Array.from({ length: 50 }, (_, i) => [
      [103.2 + i * 0.01, 30.2] as const,
      [103.5 + i * 0.01, 30.6] as const,
      [103.9 + i * 0.01, 30.9] as const,
    ]);

    const paths = createGroundFlowPath(mock.viewer, {
      positions: roadNetwork,
      clampToGround: true,
      loop: true,
    });

    // All 50 paths batched into a single GroundPolylinePrimitive with 1 preRender clock
    expect(mock.groundPrimitives.length).toBe(1);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(1);

    paths.hide();
    paths.update({ clampToGround: false, height: 1_200 });
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    paths.update({ height: 2_000 });
    expect(mock.primitives.length).toBe(1);
    expect(mock.primitives[0]?.show).toBe(false);

    paths.update({ clampToGround: true });
    expect(mock.groundPrimitives.length).toBe(1);
    expect(mock.primitives.length).toBe(0);
    expect(mock.groundPrimitives[0]?.show).toBe(false);

    paths.destroy();
    expect(mock.groundPrimitives.length).toBe(0);
    expect(mock.primitives.length).toBe(0);
    expect(mock.preRenderListeners.size).toBe(0);
  });
});
