import type * as CesiumNamespace from 'cesium';
import type { Entity, Viewer } from 'cesium';

import { loadChinaGeoData, type LngLat } from './geo';
import { createRadialGlowTexture } from './textures';

type CesiumModule = typeof CesiumNamespace;

export interface NetworkState {
  routeColor: string;
  nodeColor: string;
  routeSpeed: number;
  pulseSpeed: number;
  glowIntensity: number;
  showBorders: boolean;
  baseArcOpacity: number;
  pointBrightness: number;
  trailLength: number;
  arcHeightScale: number;
}

export interface NetworkCounts {
  routes: number;
  nodes: number;
  borderLines: number;
  provinceLines: number;
}

export interface NetworkScene {
  counts: NetworkCounts;
  restart(): void;
  setShowBorders(show: boolean): void;
  setGlowIntensity(value: number): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  triggerHubPulse(): void;
  getHubPulseCount(): number;
  isHubPulseActive(): boolean;
  destroy(): void;
}

const CENTER: LngLat = [121.4737, 31.2304];

const NODES: ReadonlyArray<{ id: string; coord: LngLat; beam: boolean }> = [
  { id: 'urumqi', coord: [87.6168, 43.8256], beam: true },
  { id: 'lhasa', coord: [91.1409, 29.6456], beam: true },
  { id: 'chengdu', coord: [104.0668, 30.5728], beam: true },
  { id: 'xian', coord: [108.9398, 34.3416], beam: true },
  { id: 'harbin', coord: [126.6424, 45.7567], beam: true },
  { id: 'kunming', coord: [102.8329, 24.8801], beam: true },
  { id: 'guangzhou', coord: [113.2644, 23.1291], beam: true },
];

/** Source cities and a manual fallback label; coordinates are WGS84 degrees. */
const ROUTES: ReadonlyArray<{ label: string; from: LngLat }> = [
  { label: 'Urumqi', from: [87.6168, 43.8256] },
  { label: 'Lhasa', from: [91.1409, 29.6456] },
  { label: 'Chengdu', from: [104.0668, 30.5728] },
  { label: 'Xian', from: [108.9398, 34.3416] },
  { label: 'Harbin', from: [126.6424, 45.7567] },
  { label: 'Kunming', from: [102.8329, 24.8801] },
  { label: 'Guangzhou', from: [113.2644, 23.1291] },
];

function toPositions(
  Cesium: CesiumModule,
  line: LngLat[],
  height: number,
): CesiumNamespace.Cartesian3[] {
  return Cesium.Cartesian3.fromDegreesArrayHeights(
    line.flatMap(([longitude, latitude]) => [longitude, latitude, height]),
  );
}

interface ArcSample {
  longitude: number;
  latitude: number;
  altitude: number;
}

function buildArc(
  Cesium: CesiumModule,
  from: LngLat,
  to: LngLat,
): { samples: ArcSample[]; duration: number } {
  const start = Cesium.Cartographic.fromDegrees(from[0], from[1]);
  const end = Cesium.Cartographic.fromDegrees(to[0], to[1]);
  const geodesic = new Cesium.EllipsoidGeodesic(start, end);
  const distance = geodesic.surfaceDistance;
  const height = Math.max(320_000, distance * 0.28);
  const samples: ArcSample[] = [];

  for (let index = 0; index <= 96; index += 1) {
    const fraction = index / 96;
    const cartographic = geodesic.interpolateUsingFraction(fraction);
    samples.push({
      longitude: cartographic.longitude,
      latitude: cartographic.latitude,
      altitude: Math.sin(Math.PI * fraction) * height,
    });
  }

  return { samples, duration: 3 + distance / 3_000_000 };
}

function arcPositions(
  Cesium: CesiumModule,
  samples: ArcSample[],
  heightScale: number,
): CesiumNamespace.Cartesian3[] {
  return samples.map((sample) =>
    Cesium.Cartesian3.fromRadians(sample.longitude, sample.latitude, sample.altitude * heightScale),
  );
}

function arcPointAt(
  Cesium: CesiumModule,
  samples: ArcSample[],
  progress: number,
  heightScale: number,
): CesiumNamespace.Cartesian3 {
  const clamped = Math.max(0, Math.min(1, progress));
  const scaled = clamped * (samples.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
  const blend = scaled - lowerIndex;
  const lower = samples[lowerIndex]!;
  const upper = samples[upperIndex]!;
  return Cesium.Cartesian3.fromRadians(
    lower.longitude + (upper.longitude - lower.longitude) * blend,
    lower.latitude + (upper.latitude - lower.latitude) * blend,
    (lower.altitude + (upper.altitude - lower.altitude) * blend) * heightScale,
  );
}

export async function createNetworkScene(
  Cesium: CesiumModule,
  viewer: Viewer,
  state: NetworkState,
  boundaryUrl: string,
  provinceUrl: string,
): Promise<NetworkScene> {
  const glowTexture = createRadialGlowTexture();
  const borderEntities: Entity[] = [];
  const provinceEntities: Entity[] = [];
  const allEntities: Entity[] = [];

  let animationSeconds = 0;
  let lastFrameTime = performance.now();
  let paused = false;
  let resetHubPulseState = () => {};
  const elapsed = () => animationSeconds;
  const restart = () => {
    animationSeconds = 0;
    lastFrameTime = performance.now();
    resetHubPulseState();
  };
  const setPaused = (value: boolean) => {
    if (value === paused) {
      return;
    }
    paused = value;
    lastFrameTime = performance.now();
  };
  const isPaused = () => paused;

  let lastRouteHex = state.routeColor;
  let routeColor = Cesium.Color.fromCssColorString(state.routeColor);
  const getRouteColor = () => {
    if (lastRouteHex !== state.routeColor) {
      lastRouteHex = state.routeColor;
      routeColor = Cesium.Color.fromCssColorString(state.routeColor);
    }
    return routeColor;
  };

  let lastNodeHex = state.nodeColor;
  let nodeColor = Cesium.Color.fromCssColorString(state.nodeColor);
  const getNodeColor = () => {
    if (lastNodeHex !== state.nodeColor) {
      lastNodeHex = state.nodeColor;
      nodeColor = Cesium.Color.fromCssColorString(state.nodeColor);
    }
    return nodeColor;
  };

  const terrainHeight = (coord: LngLat): number => {
    const cartographic = Cesium.Cartographic.fromDegrees(coord[0], coord[1]);
    return Math.max(0, viewer.scene.globe.getHeight(cartographic) ?? 0);
  };

  /** Builds a true closed circle on the ellipsoid, used for all pulse rings. */
  const circlePositionsAt = (
    center: LngLat,
    radius: number,
    height: number,
    segments = 96,
  ): CesiumNamespace.Cartesian3[] => {
    const positions: CesiumNamespace.Cartesian3[] = [];
    const latRadians = Cesium.Math.toRadians(center[1]);
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const deltaLat = (radius * Math.sin(angle)) / 110_540;
      const deltaLon = (radius * Math.cos(angle)) / (111_320 * Math.cos(latRadians));
      positions.push(
        Cesium.Cartesian3.fromDegrees(center[0] + deltaLon, center[1] + deltaLat, height),
      );
    }
    return positions;
  };

  const addEntity = (entity: Entity): Entity => {
    allEntities.push(entity);
    return entity;
  };

  const addStaticRing = (
    position: CesiumNamespace.Cartesian3,
    radius: number,
    height: number,
    color: () => CesiumNamespace.Color,
    alpha: number,
    width = 2,
  ): Entity => {
    return addEntity(
      viewer.entities.add({
        position,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height,
          fill: false,
          outline: true,
          outlineWidth: width,
          outlineColor: new Cesium.CallbackProperty(() => color().withAlpha(alpha), false),
        },
      }),
    );
  };

  interface NodeRippleState {
    entity: Entity | null;
    coord: LngLat;
    ground: number;
    baseRadius: number;
    startedAt: number;
    active: boolean;
    radius: number;
    alpha: number;
  }
  const nodeRippleStates: NodeRippleState[] = [];

  /**
   * Event-driven node ripple. It is triggered when a gold flight departs from
   * that node, expands once, fades, and is hidden; it is not a continuous loop.
   */
  const addNodeRipple = (coord: LngLat, ground: number, baseRadius: number): NodeRippleState => {
    const ripple: NodeRippleState = {
      entity: null,
      coord,
      ground,
      baseRadius,
      startedAt: 0,
      active: false,
      radius: baseRadius * 0.08,
      alpha: 0,
    };

    ripple.entity = addEntity(
      viewer.entities.add({
        show: false,
        polyline: {
          positions: new Cesium.CallbackProperty(
            () => circlePositionsAt(coord, ripple.radius, ground + 8_000, 64),
            false,
          ),
          width: 2,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.48,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(ripple.alpha), false),
          }),
        },
      }),
    );

    nodeRippleStates.push(ripple);
    return ripple;
  };

  const triggerNodeRipple = (index: number) => {
    const ripple = nodeRippleStates[index];
    if (!ripple) {
      return;
    }
    ripple.startedAt = elapsed();
    ripple.active = true;
    ripple.radius = ripple.baseRadius * 0.08;
    ripple.alpha = 0.55;
    if (ripple.entity) {
      ripple.entity.show = true;
    }
  };

  const updateNodeRipples = () => {
    const duration = Math.max(0.35, 1.2 / Math.max(0.1, state.pulseSpeed));
    for (const ripple of nodeRippleStates) {
      if (!ripple.active) {
        continue;
      }
      const progress = Math.min(1, (elapsed() - ripple.startedAt) / duration);
      ripple.radius = ripple.baseRadius * (0.08 + 0.92 * progress);
      ripple.alpha = 0.55 * Math.pow(1 - progress, 1.2);
      if (progress >= 1) {
        ripple.active = false;
        ripple.alpha = 0;
        if (ripple.entity) {
          ripple.entity.show = false;
        }
      }
    }
  };

  const geo = await loadChinaGeoData(boundaryUrl, provinceUrl);

  for (const line of geo.borderLines) {
    const positions = toPositions(Cesium, line, 18_000);
    const halo = addEntity(
      viewer.entities.add({
        show: state.showBorders,
        polyline: {
          positions,
          width: 7,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.1), false),
          }),
        },
      }),
    );
    const core = addEntity(
      viewer.entities.add({
        show: state.showBorders,
        polyline: {
          positions,
          width: 2.2,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.16,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.58), false),
          }),
        },
      }),
    );
    borderEntities.push(halo, core);
  }

  for (const line of geo.provinceLines) {
    const entity = addEntity(
      viewer.entities.add({
        show: state.showBorders,
        polyline: {
          positions: toPositions(Cesium, line, 14_000),
          width: 1,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.03,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.25), false),
          }),
        },
      }),
    );
    provinceEntities.push(entity);
  }

  for (const node of NODES) {
    const ground = terrainHeight(node.coord);
    const nodePosition = Cesium.Cartesian3.fromDegrees(
      node.coord[0],
      node.coord[1],
      ground + 36_000,
    );

    addEntity(
      viewer.entities.add({
        position: nodePosition,
        billboard: {
          image: glowTexture,
          scale: 0.26,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.9), false),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    addEntity(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground + 30_000),
        point: {
          pixelSize: 5,
          color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.98), false),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    addStaticRing(
      Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground),
      28_000,
      8_000,
      getNodeColor,
      0.32,
      1.5,
    );
    addStaticRing(
      Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground),
      48_000,
      8_000,
      getNodeColor,
      0.22,
      1.2,
    );
    addNodeRipple(node.coord, ground, 90_000);

    if (node.beam) {
      const beamLength = 520_000;
      addEntity(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            node.coord[0],
            node.coord[1],
            ground + beamLength / 2,
          ),
          cylinder: {
            length: beamLength,
            topRadius: 2_000,
            bottomRadius: 13_000,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.1), false),
            ),
          },
        }),
      );

      addEntity(
        viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground + 2_000),
              Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground + beamLength),
            ],
            width: 5,
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.5,
              color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.52), false),
            }),
          },
        }),
      );

      addEntity(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            node.coord[0],
            node.coord[1],
            ground + beamLength,
          ),
          point: {
            pixelSize: 4,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(0.9), false),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
  }

  const centerGround = terrainHeight(CENTER);
  addEntity(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround + 42_000),
      billboard: {
        image: glowTexture,
        scale: 0.75,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.28), false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  addEntity(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround + 42_000),
      billboard: {
        image: glowTexture,
        scale: 0.45,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.9), false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  addEntity(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround + 30_000),
      point: {
        pixelSize: 11,
        color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(1), false),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );

  const centerPosition = Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround);
  for (const [index, baseRadius] of [
    120_000, 210_000, 330_000, 470_000, 620_000, 780_000,
  ].entries()) {
    addStaticRing(centerPosition, baseRadius, 10_000, getRouteColor, 0.52 - index * 0.055, 2.5);
  }

  const HUB_PULSE_DURATION = 1.3;
  let hubPulseActive = false;
  let hubPulseStartedAt = Number.NEGATIVE_INFINITY;
  let hubPulseCount = 0;
  let hubPulseRadius = 25_000;
  let hubPulseAlpha = 0;
  let hubFlash = 0;

  const hubWave = addEntity(
    viewer.entities.add({
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(
          () => circlePositionsAt(CENTER, hubPulseRadius, centerGround + 12_000),
          false,
        ),
        width: new Cesium.CallbackProperty(() => 3.5 + 3 * (1 - hubPulseAlpha), false),
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.45,
          color: new Cesium.CallbackProperty(
            () => getRouteColor().withAlpha(hubPulseAlpha * 0.82),
            false,
          ),
        }),
      },
    }),
  );

  const hubFlashEntity = addEntity(
    viewer.entities.add({
      show: false,
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround + 42_000),
      billboard: {
        image: glowTexture,
        scale: new Cesium.CallbackProperty(() => 0.18 + 0.55 * hubFlash, false),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        color: new Cesium.CallbackProperty(
          () => getRouteColor().withAlpha(0.28 + 0.4 * hubFlash),
          false,
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );

  const triggerHubPulse = () => {
    // Merge arrivals while a pulse is active rather than stacking flashes.
    if (hubPulseActive) {
      return;
    }
    hubPulseActive = true;
    hubPulseStartedAt = elapsed();
    hubPulseCount += 1;
    hubWave.show = true;
    hubFlashEntity.show = true;
  };

  const updateHubPulse = () => {
    if (!hubPulseActive) {
      return;
    }
    const progress = Math.min(1, (elapsed() - hubPulseStartedAt) / HUB_PULSE_DURATION);
    const eased = 1 - Math.pow(1 - progress, 2.2);
    hubPulseRadius = 25_000 + 520_000 * eased;
    hubPulseAlpha = 0.8 * Math.pow(1 - progress, 1.22);
    hubFlash = Math.pow(1 - progress, 4);

    if (progress >= 1) {
      hubPulseActive = false;
      hubPulseAlpha = 0;
      hubFlash = 0;
      hubWave.show = false;
      hubFlashEntity.show = false;
    }
  };

  interface RouteSchedule {
    duration: number;
    phase: number;
    nodeIndex: number;
    lastProgress: number;
  }
  const routeSchedules: RouteSchedule[] = [];

  for (const [index, route] of ROUTES.entries()) {
    const arc = buildArc(Cesium, route.from, CENTER);
    const basePositions = new Cesium.CallbackProperty(
      () => arcPositions(Cesium, arc.samples, state.arcHeightScale),
      false,
    );

    addEntity(
      viewer.entities.add({
        polyline: {
          positions: basePositions,
          width: 8,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.32,
            color: new Cesium.CallbackProperty(
              () => getRouteColor().withAlpha(state.baseArcOpacity * 0.24),
              false,
            ),
          }),
        },
      }),
    );
    addEntity(
      viewer.entities.add({
        polyline: {
          positions: basePositions,
          width: 2.4,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.14,
            color: new Cesium.CallbackProperty(
              () => getRouteColor().withAlpha(state.baseArcOpacity),
              false,
            ),
          }),
        },
      }),
    );

    const phaseOffset = index * 0.13;
    routeSchedules.push({
      duration: arc.duration,
      phase: phaseOffset,
      nodeIndex: index,
      lastProgress: ((elapsed() * state.routeSpeed) / arc.duration + phaseOffset) % 1,
    });

    const progressAt = () => ((elapsed() * state.routeSpeed) / arc.duration + phaseOffset) % 1;
    const positionAt = (progress: number) =>
      arcPointAt(Cesium, arc.samples, progress, state.arcHeightScale);
    const envelopeAt = (progress: number) => Math.min(1, progress / 0.035, (1 - progress) / 0.035);

    addEntity(
      viewer.entities.add({
        position: new Cesium.CallbackPositionProperty(() => positionAt(progressAt()), false),
        billboard: {
          image: glowTexture,
          scale: new Cesium.CallbackProperty(() => 0.05 + 0.05 * state.pointBrightness, false),
          show: new Cesium.CallbackProperty(() => envelopeAt(progressAt()) > 0.01, false),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          color: new Cesium.CallbackProperty(
            () =>
              getRouteColor().withAlpha(
                Math.min(1, 0.55 * state.pointBrightness * envelopeAt(progressAt())),
              ),
            false,
          ),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    addEntity(
      viewer.entities.add({
        position: new Cesium.CallbackPositionProperty(() => positionAt(progressAt()), false),
        point: {
          pixelSize: new Cesium.CallbackProperty(() => 6 + 2 * state.pointBrightness, false),
          color: new Cesium.CallbackProperty(
            () =>
              Cesium.Color.lerp(
                Cesium.Color.WHITE,
                getRouteColor(),
                0.35,
                new Cesium.Color(),
              ).withAlpha(Math.min(1, 0.95 * state.pointBrightness * envelopeAt(progressAt()))),
            false,
          ),
          outlineColor: new Cesium.CallbackProperty(
            () => getRouteColor().withAlpha(0.7 * envelopeAt(progressAt())),
            false,
          ),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    // One continuous tapered polyline is the comet trail. Cesium's PolylineGlow
    // taper is asymmetric in shader space: with positions ordered tail -> head,
    // st.s = 0 fades to transparent and st.s = 1 stays bright at the head.
    const trailPositions = new Cesium.CallbackProperty(() => {
      const head = progressAt();
      const tail = Math.max(0, head - state.trailLength);
      const segments = 24;
      const positions: CesiumNamespace.Cartesian3[] = [];
      for (let index = 0; index < segments; index += 1) {
        const fraction = index / (segments - 1);
        positions.push(positionAt(tail + (head - tail) * fraction));
      }
      return positions;
    }, false);

    addEntity(
      viewer.entities.add({
        polyline: {
          positions: trailPositions,
          width: 4,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            taperPower: 0.5,
            color: new Cesium.CallbackProperty(
              () =>
                getRouteColor().withAlpha(
                  Math.min(1, 0.72 * state.pointBrightness * envelopeAt(progressAt())),
                ),
              false,
            ),
          }),
        },
      }),
    );
  }

  const removePreRender = viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    if (!paused) {
      animationSeconds += (now - lastFrameTime) / 1000;
    }
    lastFrameTime = now;

    for (const schedule of routeSchedules) {
      const progress = ((elapsed() * state.routeSpeed) / schedule.duration + schedule.phase) % 1;
      if (progress < schedule.lastProgress - 0.5) {
        triggerHubPulse();
        triggerNodeRipple(schedule.nodeIndex);
      }
      schedule.lastProgress = progress;
    }

    updateNodeRipples();
    updateHubPulse();
  });

  resetHubPulseState = () => {
    hubPulseActive = false;
    hubPulseStartedAt = Number.NEGATIVE_INFINITY;
    hubPulseCount = 0;
    hubPulseRadius = 25_000;
    hubPulseAlpha = 0;
    hubFlash = 0;
    hubWave.show = false;
    hubFlashEntity.show = false;

    for (const ripple of nodeRippleStates) {
      ripple.active = false;
      ripple.alpha = 0;
      ripple.radius = ripple.baseRadius * 0.08;
      if (ripple.entity) {
        ripple.entity.show = false;
      }
    }

    for (const schedule of routeSchedules) {
      schedule.lastProgress =
        ((elapsed() * state.routeSpeed) / schedule.duration + schedule.phase) % 1;
    }
  };

  const setShowBorders = (show: boolean) => {
    for (const entity of borderEntities) {
      entity.show = show;
    }
    for (const entity of provinceEntities) {
      entity.show = show;
    }
  };

  return {
    counts: {
      routes: ROUTES.length,
      nodes: NODES.length,
      borderLines: geo.borderLines.length,
      provinceLines: geo.provinceLines.length,
    },
    restart,
    setShowBorders,
    setGlowIntensity: (value: number) => {
      state.glowIntensity = value;
    },
    setPaused,
    isPaused,
    triggerHubPulse,
    getHubPulseCount: () => hubPulseCount,
    isHubPulseActive: () => hubPulseActive,
    destroy: () => {
      removePreRender();
      for (const entity of allEntities) {
        viewer.entities.remove(entity);
      }
      allEntities.length = 0;
      borderEntities.length = 0;
      provinceEntities.length = 0;
    },
  };
}
