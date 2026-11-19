import {
  ArcType,
  CallbackPositionProperty,
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  JulianDate,
  PolylineGlowMaterialProperty,
  type Viewer,
} from 'cesium';

export interface FlowingArcOptions {
  from: readonly [longitude: number, latitude: number];
  to: readonly [longitude: number, latitude: number];
  /** Maximum height in metres above the viewer's ellipsoid. */
  height?: number;
  /** Seconds of Cesium clock time per trip. */
  duration?: number;
  color?: Color;
}

function toCartographic([longitude, latitude]: FlowingArcOptions['from']): Cartographic {
  if (
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  ) {
    throw new RangeError('Expected longitude in [-180, 180] and latitude in [-90, 90].');
  }
  return Cartographic.fromDegrees(longitude, latitude);
}

/** Adds a luminous geodesic arc and a point travelling along it. */
export function createFlowingArc(
  viewer: Viewer,
  { from, to, height = 350_000, duration = 4, color = Color.DEEPSKYBLUE }: FlowingArcOptions,
): { destroy(): void } {
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('Height and duration must be finite positive numbers.');
  }

  const ellipsoid = viewer.scene.ellipsoid;
  const origin = toCartographic(from);
  const destination = toCartographic(to);
  const angle = Cartesian3.angleBetween(
    ellipsoid.cartographicToCartesian(origin),
    ellipsoid.cartographicToCartesian(destination),
  );
  if (angle < 1e-12) {
    throw new RangeError('The start and end coordinates must differ.');
  }
  // Match Cesium's geodesic solver guard in production builds too.
  if (Math.PI - angle < 0.0125) {
    throw new RangeError('The start and end coordinates are too close to antipodal.');
  }
  const geodesic = new EllipsoidGeodesic(origin, destination, ellipsoid);

  const scratch = new Cartographic();
  function positionAt(fraction: number, result?: Cartesian3): Cartesian3 {
    geodesic.interpolateUsingFraction(fraction, scratch);
    scratch.height = height * Math.sin(Math.PI * fraction);
    return ellipsoid.cartographicToCartesian(scratch, result);
  }

  const positions = Array.from({ length: 97 }, (_, index) => positionAt(index / 96));
  const clock = viewer.clock;
  const start = JulianDate.clone(clock.currentTime);
  const entities = viewer.entities;
  const arc = entities.add({
    position: new CallbackPositionProperty((time, result) => {
      const seconds = JulianDate.secondsDifference(time ?? clock.currentTime, start);
      const fraction = (((seconds % duration) + duration) % duration) / duration;
      return positionAt(fraction, result);
    }, false),
    point: { pixelSize: 11, color: Color.WHITE, outlineColor: color, outlineWidth: 2 },
    polyline: {
      positions,
      arcType: ArcType.NONE,
      width: 6,
      material: new PolylineGlowMaterialProperty({ color, glowPower: 0.25 }),
    },
  });

  return {
    destroy() {
      if (!viewer.isDestroyed()) entities.remove(arc);
    },
  };
}
