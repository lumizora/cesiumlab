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
  const elapsed = () => (performance.now() - startedAt) / 1000;
  const restart = () => {
    startedAt = performance.now();
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

  const addEntity = (entity: Entity): Entity => {
    allEntities.push(entity);
    return entity;
  };

  interface PulseRingOptions {
    position: CesiumNamespace.Cartesian3;
    baseRadius: number;
    minScale: number;
    maxScale: number;
    phase: number;
    alpha: number;
    color: () => CesiumNamespace.Color;
    height: number;
    width?: number;
  }

  /**
   * The single pulse implementation shared by the gold core and the blue nodes.
   * A ring only expands outward, fades, and restarts at its base radius; it
   * never contracts, which avoids the "jellyfish" breathing look.
   */
  const addPulseRing = (options: PulseRingOptions): Entity => {
    const cycleSeconds = 4.5;
    let lastFrame = -1;
    let radius = options.baseRadius * options.minScale;

    const getRadius = () => {
      const time = elapsed() * state.pulseSpeed;
      const frame = Math.floor(time * 60);
      if (frame !== lastFrame) {
        lastFrame = frame;
        const phase = (time / cycleSeconds + options.phase) % 1;
        radius =
          options.baseRadius * (options.minScale + (options.maxScale - options.minScale) * phase);
      }
      return radius;
    };

    const getAlpha = () => {
      const phase = ((elapsed() * state.pulseSpeed) / cycleSeconds + options.phase) % 1;
      return options.alpha * (1 - phase);
    };

    return addEntity(
      viewer.entities.add({
        position: options.position,
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(getRadius, false),
          // Constant floor keeps the ellipse valid while the major axis pulses.
          semiMinorAxis: options.baseRadius * options.minScale * 0.98,
          height: options.height,
          fill: false,
          outline: true,
          outlineWidth: options.width ?? 2,
          outlineColor: new Cesium.CallbackProperty(
            () => options.color().withAlpha(getAlpha()),
            false,
          ),
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

    for (const [baseRadius, phaseOffset] of [
      [110_000, 0],
      [180_000, 0.5],
    ] as const) {
      addPulseRing({
        position: Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground),
        baseRadius,
        minScale: 0.35,
        maxScale: 1.2,
        phase: phaseOffset,
        alpha: 0.7,
        color: getNodeColor,
        height: 8_000,
      });
    }

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

  for (const [index, baseRadius] of [
    120_000, 210_000, 330_000, 470_000, 620_000, 780_000,
  ].entries()) {
    addPulseRing({
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround),
      baseRadius,
      minScale: 1,
      maxScale: 1.12,
      phase: index / 6,
      alpha: 0.8,
      color: getRouteColor,
      height: 10_000,
      width: 4,
    });
  }

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
    destroy: () => {
      for (const entity of allEntities) {
        viewer.entities.remove(entity);
      }
      allEntities.length = 0;
      borderEntities.length = 0;
      provinceEntities.length = 0;
    },
  };
}
