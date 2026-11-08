export type LngLat = readonly [number, number];

export interface GeoData {
  borderLines: LngLat[][];
  provinceLines: LngLat[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePoint(value: unknown): LngLat {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Invalid GeoJSON position.');
  }
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    throw new Error('GeoJSON position must contain numeric longitude and latitude.');
  }
  return [longitude, latitude];
}

function parseLine(value: unknown): LngLat[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid GeoJSON line coordinates.');
  }
  return value.map(parsePoint);
}

function linesFromGeometry(geometry: unknown): LngLat[][] {
  if (!isRecord(geometry) || typeof geometry.type !== 'string') {
    throw new Error('Invalid GeoJSON geometry.');
  }

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) {
    throw new Error('GeoJSON geometry has no coordinate array.');
  }

  switch (geometry.type) {
    case 'LineString':
      return [parseLine(coordinates)];
    case 'MultiLineString':
      return coordinates.map(parseLine);
    case 'Polygon':
      return coordinates.map(parseLine);
    case 'MultiPolygon':
      return coordinates.flatMap((polygon) => {
        if (!Array.isArray(polygon)) {
          throw new Error('Invalid GeoJSON polygon.');
        }
        return polygon.map(parseLine);
      });
    default:
      throw new Error(`Unsupported GeoJSON geometry: ${geometry.type}`);
  }
}

async function loadLines(url: string): Promise<LngLat[][]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load GeoJSON (${response.status}): ${url}`);
  }
  const collection: unknown = await response.json();
  if (!isRecord(collection) || !Array.isArray(collection.features)) {
    throw new Error(`GeoJSON is not a FeatureCollection: ${url}`);
  }

  const lines: LngLat[][] = [];
  for (const feature of collection.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      continue;
    }
    lines.push(...linesFromGeometry(feature.geometry));
  }
  return lines;
}

/**
 * Loads vendored Natural Earth 1:50m boundaries. The data is public domain;
 * the line depiction follows Natural Earth and is not an authoritative
 * statement on disputed boundaries or sovereignty.
 */
export async function loadChinaGeoData(boundaryUrl: string, provinceUrl: string): Promise<GeoData> {
  const [borderLines, provinceLines] = await Promise.all([
    loadLines(boundaryUrl),
    loadLines(provinceUrl),
  ]);
  return { borderLines, provinceLines };
}
