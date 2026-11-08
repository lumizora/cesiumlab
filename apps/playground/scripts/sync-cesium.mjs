import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_DIRS = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];

function findCesiumRoot() {
  try {
    return dirname(fileURLToPath(import.meta.resolve('cesium/package.json')));
  } catch {
    // Fall back to resolving the package entry and walking up to its package.json.
  }

  let dir = dirname(fileURLToPath(import.meta.resolve('cesium')));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
      if (pkg.name === 'cesium') return dir;
    }
    dir = dirname(dir);
  }

  throw new Error('Unable to locate the cesium package root.');
}

const cesiumRoot = findCesiumRoot();
const cesiumPackage = JSON.parse(readFileSync(join(cesiumRoot, 'package.json'), 'utf8'));
const version = String(cesiumPackage.version);
const sourceRoot = join(cesiumRoot, 'Build', 'Cesium');
const targetRoot = resolve(fileURLToPath(new URL('../public/cesium', import.meta.url)));
const markerPath = join(targetRoot, '.cesium-version');
const marker = `${version}\n${STATIC_DIRS.join(',')}\n`;

if (
  existsSync(markerPath) &&
  readFileSync(markerPath, 'utf8') === marker &&
  STATIC_DIRS.every((dir) => existsSync(join(targetRoot, dir)))
) {
  console.log(`[cesium] Static assets already synced for ${version}.`);
  process.exit(0);
}

if (!existsSync(sourceRoot)) {
  throw new Error(`[cesium] Expected Cesium build assets at ${sourceRoot}.`);
}

console.log(`[cesium] Syncing ${STATIC_DIRS.join(', ')} for ${version} ...`);
rmSync(targetRoot, { recursive: true, force: true });
mkdirSync(targetRoot, { recursive: true });

for (const dir of STATIC_DIRS) {
  const from = join(sourceRoot, dir);
  if (!existsSync(from)) {
    throw new Error(`[cesium] Missing expected asset directory: ${from}`);
  }
  cpSync(from, join(targetRoot, dir), { recursive: true });
}

writeFileSync(markerPath, marker);
console.log(`[cesium] Static assets synced to ${targetRoot}.`);
