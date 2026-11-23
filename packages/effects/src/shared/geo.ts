import { Cartographic, Color, type Viewer } from 'cesium';

export type LngLat = readonly [longitude: number, latitude: number];
export type ColorInput = Color | string;

export function validateLngLat([longitude, latitude]: LngLat, label = 'coordinate'): Cartographic {
  if (
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  ) {
    throw new RangeError(`Expected ${label} longitude in [-180, 180] and latitude in [-90, 90].`);
  }
  return Cartographic.fromDegrees(longitude, latitude);
}

export function validatePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Expected ${label} to be a finite positive number.`);
  }
}

export function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Expected ${label} to be a finite non-negative number.`);
  }
}

export function resolveColor(input: ColorInput | undefined, fallback: Color): Color {
  if (!input) return fallback;
  if (typeof input === 'string') {
    return Color.fromCssColorString(input);
  }
  return input;
}

export function sampleGroundHeight(viewer: Viewer, coord: LngLat): number {
  const cartographic = Cartographic.fromDegrees(coord[0], coord[1]);
  return Math.max(0, viewer.scene.globe?.getHeight(cartographic) ?? 0);
}
