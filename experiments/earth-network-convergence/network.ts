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

function buildArc(
  Cesium: CesiumModule,
  from: LngLat,
  to: LngLat,
): { positions: CesiumNamespace.Cartesian3[]; duration: number } {
  const start = Cesium.Cartographic.fromDegrees(from[0], from[1]);
  const end = Cesium.Cartographic.fromDegrees(to[0], to[1]);
  const geodesic = new Cesium.EllipsoidGeodesic(start, end);
  const distance = geodesic.surfaceDistance;
  const height = Math.max(320_000, distance * 0.28);
  const positions: CesiumNamespace.Cartesian3[] = [];

  for (let index = 0; index <= 72; index += 1) {
    const fraction = index / 72;
    const cartographic = geodesic.interpolateUsingFraction(fraction);
    const altitude = Math.sin(Math.PI * fraction) * height;
    positions.push(
      Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude),
    );
  }

  return { positions, duration: 6 + distance / 1_600_000 };
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

  let startedAt = performance.now();
  let resetHubPulseState = () => {};
  const elapsed = () => (performance.now() - startedAt) / 1000;
  const restart = () => {
    startedAt = performance.now();
    resetHubPulseState();
  };

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

  /**
   * Blue node ripple: continuous, low-energy, 2.5s loop per node, with each
   * node phased differently. It deliberately does not share timing or meaning
   * with the gold hub pulse.
   */
  const addNodeRipple = (
    coord: LngLat,
    ground: number,
    baseRadius: number,
    phase: number,
  ): Entity => {
    const cycleSeconds = 2.5;
    let lastFrame = -1;
    let radius = baseRadius * 0.08;

    const getProgress = () => ((elapsed() * state.pulseSpeed) / cycleSeconds + phase) % 1;

    const getRadius = () => {
      const time = elapsed() * state.pulseSpeed;
      const frame = Math.floor(time * 60);
      if (frame !== lastFrame) {
        lastFrame = frame;
        radius = baseRadius * (0.08 + 0.92 * getProgress());
      }
      return radius;
    };

    const getAlpha = () => 0.5 * Math.pow(1 - getProgress(), 1.4);

    return addEntity(
      viewer.entities.add({
        polyline: {
          // A polyline circle keeps the ripple a true circle at every radius;
          // an ellipse with a constant minor axis would become a thin sliver.
          positions: new Cesium.CallbackProperty(
            () => circlePositionsAt(coord, getRadius(), ground + 8_000, 64),
            false,
          ),
          width: 2,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.48,
            color: new Cesium.CallbackProperty(() => getNodeColor().withAlpha(getAlpha()), false),
          }),
        },
      }),
    );
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

  for (const [nodeIndex, node] of NODES.entries()) {
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
    addNodeRipple(node.coord, ground, 90_000, (nodeIndex * 0.17) % 1);

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
        width: new Cesium.CallbackProperty(() => 4 + 5 * (1 - hubPulseAlpha), false),
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.45,
          color: new Cesium.CallbackProperty(
            () => getRouteColor().withAlpha(hubPulseAlpha * 0.95),
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
        scale: new Cesium.CallbackProperty(() => 0.2 + 0.65 * hubFlash, false),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        color: new Cesium.CallbackProperty(
          () => getRouteColor().withAlpha(0.35 + 0.5 * hubFlash),
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
    hubPulseStartedAt = performance.now();
    hubPulseCount += 1;
    hubWave.show = true;
    hubFlashEntity.show = true;
  };

  const updateHubPulse = (now: number) => {
    if (!hubPulseActive) {
      return;
    }
    const progress = Math.min(1, (now - hubPulseStartedAt) / 1000 / HUB_PULSE_DURATION);
    const eased = 1 - Math.pow(1 - progress, 2.2);
    hubPulseRadius = 25_000 + 520_000 * eased;
    hubPulseAlpha = Math.pow(1 - progress, 1.22);
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
    lastProgress: number;
  }
  const routeSchedules: RouteSchedule[] = [];

  for (const [index, route] of ROUTES.entries()) {
    const arc = buildArc(Cesium, route.from, CENTER);
    addEntity(
      viewer.entities.add({
        polyline: {
          positions: arc.positions,
          width: 10,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.38,
            color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.15), false),
          }),
        },
      }),
    );
    addEntity(
      viewer.entities.add({
        polyline: {
          positions: arc.positions,
          width: 3.4,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.18,
            color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.9), false),
          }),
        },
      }),
    );

    const phaseOffset = index * 0.13;
    routeSchedules.push({
      duration: arc.duration,
      phase: phaseOffset,
      lastProgress: ((elapsed() * state.routeSpeed) / arc.duration + phaseOffset) % 1,
    });
    const positionAt = (progress: number) => {
      const pointIndex = Math.min(
        arc.positions.length - 1,
        Math.floor(progress * (arc.positions.length - 1)),
      );
      return arc.positions[pointIndex] ?? arc.positions[0]!;
    };

    addEntity(
      viewer.entities.add({
        position: new Cesium.CallbackPositionProperty(() => {
          const progress = ((elapsed() * state.routeSpeed) / arc.duration + phaseOffset) % 1;
          return positionAt(progress);
        }, false),
        billboard: {
          image: glowTexture,
          scale: 0.13,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.9), false),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );

    for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) {
      const particlePhase = phaseOffset + particleIndex / 3;
      addEntity(
        viewer.entities.add({
          position: new Cesium.CallbackPositionProperty(() => {
            const progress = ((elapsed() * state.routeSpeed) / arc.duration + particlePhase) % 1;
            return positionAt(progress);
          }, false),
          point: {
            pixelSize: particleIndex === 0 ? 9 : 6,
            color: new Cesium.CallbackProperty(() => getRouteColor().withAlpha(0.98), false),
            outlineColor: Cesium.Color.WHITE.withAlpha(0.75),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
  }

  const removePreRender = viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    const time = (now - startedAt) / 1000;

    for (const schedule of routeSchedules) {
      const progress = ((time * state.routeSpeed) / schedule.duration + schedule.phase) % 1;
      if (progress < schedule.lastProgress - 0.5) {
        triggerHubPulse();
      }
      schedule.lastProgress = progress;
    }

    updateHubPulse(now);
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
