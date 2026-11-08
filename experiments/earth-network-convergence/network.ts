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
  beamHeight: number;
  beamCoreWidth: number;
  beamGlowWidth: number;
  beamIntensity: number;
  beamBreathingSpeed: number;
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

const BEAM_HEIGHT_FACTORS = [1, 0.86, 0.94, 1.04, 0.9, 0.82, 0.98];
const BEAM_INTENSITY_FACTORS = [1, 0.9, 0.95, 1.05, 0.92, 0.88, 1];

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

  /**
   * Continuous node ripple. Three staggered rings share one 2.4s lifetime and
   * are offset by 0.8s, so an active node always shows roughly 2-3 rings.
   */
  const addNodeRipple = (
    coord: LngLat,
    ground: number,
    baseRadius: number,
    phase: number,
  ): Entity => {
    const lifetime = 2.4;
    const progressAt = () => ((elapsed() * state.pulseSpeed) / lifetime + phase) % 1;

    return addEntity(
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(
            () =>
              circlePositionsAt(
                coord,
                baseRadius * (0.08 + 0.92 * progressAt()),
                ground + 8_000,
                64,
              ),
            false,
          ),
          width: new Cesium.CallbackProperty(() => 1.3 + 1.7 * progressAt(), false),
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.48,
            color: new Cesium.CallbackProperty(
              () => getNodeColor().withAlpha(0.58 * Math.pow(1 - progressAt(), 1.25)),
              false,
            ),
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

    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      addNodeRipple(node.coord, ground, 90_000, nodeIndex * 0.17 + ringIndex / 3);
    }

    if (node.beam) {
      const baseHeight = 520_000 * BEAM_HEIGHT_FACTORS[nodeIndex]!;
      const intensityFactor = BEAM_INTENSITY_FACTORS[nodeIndex]!;
      const phase = nodeIndex * 0.9;
      const breath = () =>
        0.985 +
        0.015 *
          Math.sin(
            (elapsed() * Math.PI * 2) / (7 / Math.max(0.2, state.beamBreathingSpeed)) + phase,
          );
      const breathAlpha = () =>
        0.9 +
        0.1 *
          Math.sin(
            (elapsed() * Math.PI * 2) / (8 / Math.max(0.2, state.beamBreathingSpeed)) + phase + 1.1,
          );

      const layers: ReadonlyArray<{
        count: number;
        scale: number;
        alpha: number;
        kind: 'core' | 'glow';
        color: () => CesiumNamespace.Color;
      }> = [
        {
          count: 36,
          scale: 0.11,
          alpha: 0.82,
          kind: 'core',
          color: () =>
            Cesium.Color.lerp(Cesium.Color.WHITE, getNodeColor(), 0.12, new Cesium.Color()),
        },
        {
          count: 30,
          scale: 0.19,
          alpha: 0.3,
          kind: 'glow',
          color: () =>
            Cesium.Color.lerp(getNodeColor(), Cesium.Color.WHITE, 0.4, new Cesium.Color()),
        },
        {
          count: 24,
          scale: 0.3,
          alpha: 0.12,
          kind: 'glow',
          color: getNodeColor,
        },
      ];

      const nearFar = new Cesium.NearFarScalar(700_000, 2.8, 9_000_000, 0.65);
      for (const layer of layers) {
        const widthFactor = layer.kind === 'core' ? state.beamCoreWidth : state.beamGlowWidth;
        for (let index = 0; index < layer.count; index += 1) {
          const t = index / (layer.count - 1);
          addEntity(
            viewer.entities.add({
              position: new Cesium.CallbackPositionProperty(
                () =>
                  Cesium.Cartesian3.fromDegrees(
                    node.coord[0],
                    node.coord[1],
                    ground + 8_000 + (baseHeight * state.beamHeight - 8_000) * t,
                  ),
                false,
              ),
              billboard: {
                image: glowTexture,
                scale: new Cesium.CallbackProperty(
                  () => layer.scale * (1 - 0.55 * t) * widthFactor * breath(),
                  false,
                ),
                scaleByDistance: nearFar,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                color: new Cesium.CallbackProperty(
                  () =>
                    layer
                      .color()
                      .withAlpha(
                        Math.min(
                          1,
                          layer.alpha *
                            Math.pow(1 - t, 1.35) *
                            state.beamIntensity *
                            intensityFactor *
                            breathAlpha(),
                        ),
                      ),
                  false,
                ),
              },
            }),
          );
        }
      }

      // A soft base bloom visually joins the beam to the node marker.
      addEntity(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(node.coord[0], node.coord[1], ground + 16_000),
          billboard: {
            image: glowTexture,
            scale: new Cesium.CallbackProperty(() => 0.3 * state.beamIntensity * breath(), false),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            color: new Cesium.CallbackProperty(
              () => getNodeColor().withAlpha(0.5 * state.beamIntensity * breathAlpha()),
              false,
            ),
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

  // Layer 1: continuous ambient hub ripples. Three staggered rings are always
  // present; they are independent of arrival events and never reset on a pulse.
  const HUB_AMBIENT_LIFETIME = 3.2;
  const hubAmbientProgress = (phase: number) => (elapsed() / HUB_AMBIENT_LIFETIME + phase) % 1;

  for (let index = 0; index < 3; index += 1) {
    const phase = index / 3;
    addEntity(
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const progress = hubAmbientProgress(phase);
            const eased = 1 - Math.pow(1 - progress, 2.1);
            return circlePositionsAt(CENTER, 25_000 + 700_000 * eased, centerGround + 11_000);
          }, false),
          width: new Cesium.CallbackProperty(() => 3 + 3.5 * hubAmbientProgress(phase), false),
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: new Cesium.CallbackProperty(
              () => getRouteColor().withAlpha(0.5 * Math.pow(1 - hubAmbientProgress(phase), 1.3)),
              false,
            ),
          }),
        },
      }),
    );
  }

  // Layer 2: arrival-triggered strong pulse, two high-brightness rings that
  // expand quickly, decelerate, widen and fade. Ambient rings are untouched.
  const HUB_PULSE_DURATION = 1.3;
  let hubPulseActive = false;
  let hubPulseStartedAt = Number.NEGATIVE_INFINITY;
  let hubPulseCount = 0;
  let hubFlash = 0;

  interface HubPulseRing {
    entity: Entity | null;
    offset: number;
    progress: number;
    radius: number;
    alpha: number;
  }
  const hubPulseRings: HubPulseRing[] = [];

  for (const offset of [0, 0.12]) {
    const ring: HubPulseRing = {
      entity: null,
      offset,
      progress: 0,
      radius: 25_000,
      alpha: 0,
    };
    ring.entity = addEntity(
      viewer.entities.add({
        show: false,
        polyline: {
          positions: new Cesium.CallbackProperty(
            () => circlePositionsAt(CENTER, ring.radius, centerGround + 13_000),
            false,
          ),
          width: new Cesium.CallbackProperty(() => 4 + 8 * ring.progress, false),
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.5,
            color: new Cesium.CallbackProperty(
              () => getRouteColor().withAlpha(ring.alpha * 0.9),
              false,
            ),
          }),
        },
      }),
    );
    hubPulseRings.push(ring);
  }

  const hubFlashEntity = addEntity(
    viewer.entities.add({
      show: false,
      position: Cesium.Cartesian3.fromDegrees(CENTER[0], CENTER[1], centerGround + 42_000),
      billboard: {
        image: glowTexture,
        scale: new Cesium.CallbackProperty(() => 0.2 + 0.9 * hubFlash, false),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        color: new Cesium.CallbackProperty(
          () => getRouteColor().withAlpha(0.3 + 0.5 * hubFlash),
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
    for (const ring of hubPulseRings) {
      if (ring.entity) {
        ring.entity.show = true;
      }
    }
    hubFlashEntity.show = true;
  };

  const updateHubPulse = () => {
    if (!hubPulseActive) {
      return;
    }
    const age = elapsed() - hubPulseStartedAt;
    let anyRingActive = false;

    for (const ring of hubPulseRings) {
      const progress = Math.min(1, (age - ring.offset) / HUB_PULSE_DURATION);
      if (progress < 0) {
        ring.progress = 0;
        ring.alpha = 0;
        if (ring.entity) {
          ring.entity.show = false;
        }
        continue;
      }
      ring.progress = progress;
      const eased = 1 - Math.pow(1 - progress, 2.4);
      ring.radius = 25_000 + 760_000 * eased;
      ring.alpha = 0.95 * Math.pow(1 - progress, 1.1);
      if (ring.entity) {
        ring.entity.show = progress < 1;
      }
      if (progress < 1) {
        anyRingActive = true;
      }
    }

    hubFlash = Math.pow(Math.max(0, 1 - age / 0.5), 2);

    if (!anyRingActive) {
      hubPulseActive = false;
      hubFlash = 0;
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
      }
      schedule.lastProgress = progress;
    }

    updateHubPulse();
  });

  resetHubPulseState = () => {
    hubPulseActive = false;
    hubPulseStartedAt = Number.NEGATIVE_INFINITY;
    hubPulseCount = 0;
    hubFlash = 0;
    hubFlashEntity.show = false;

    for (const ring of hubPulseRings) {
      ring.progress = 0;
      ring.alpha = 0;
      ring.radius = 25_000;
      if (ring.entity) {
        ring.entity.show = false;
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
