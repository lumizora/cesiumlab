import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist-base');
const requestedBase = process.argv[3] ?? '/cesiumlab/';
const base = requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`;

const required = [
  'index.html',
  '.nojekyll',
  'cesium/Workers',
  'cesium/Assets',
  'cesium/Widgets',
  'cesium/ThirdParty',
];

const failures = [];
for (const item of required) {
  if (!existsSync(join(distDir, item))) {
    failures.push(`missing ${item}`);
  }
}

const indexPath = join(distDir, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  if (!html.includes(`${base}assets/`)) {
    failures.push(`index.html does not reference ${base}assets/`);
  }
  if (!html.includes(`${base}favicon.svg`)) {
    failures.push(`index.html does not reference ${base}favicon.svg`);
  }
  if (html.includes('src="/src/')) {
    failures.push('index.html still references source files');
  }
}

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      files.push(full);
    }
  }
}
if (existsSync(distDir)) walk(distDir);

for (const file of files) {
  const local = relative(distDir, file).replaceAll('\\', '/');
  if (/(^|\/)target\.png$/i.test(local)) {
    failures.push(`forbidden reference image: ${local}`);
  }
  if (/(^|\/)(docs\/stage2|stage2\/cesiumlab-stage2)/i.test(local)) {
    failures.push(`forbidden task package path: ${local}`);
  }
  if (/(^|\/)\.env(\.|$)/i.test(local)) {
    failures.push(`forbidden environment file: ${local}`);
  }
  if (/\.map$/i.test(local)) {
    failures.push(`source map present: ${local}`);
  }
}

for (const file of files) {
  if (!/\.(html|js|css|json|txt|svg)$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('docs/stage2') || text.includes('S2-001-earth-network/target')) {
    failures.push(`forbidden private path in ${relative(distDir, file).replaceAll('\\', '/')}`);
  }
}

const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`[dist] ${distDir}`);
console.log(`[dist] ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`[dist] base ${base}`);

if (failures.length > 0) {
  console.error('[dist] FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[dist] PASS: required Cesium assets, base paths and public safety checks');
