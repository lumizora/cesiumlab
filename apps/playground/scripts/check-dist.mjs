import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const requestedBase = process.argv[3] ?? '/';
const base = new URL(requestedBase, 'https://example.invalid/');

if (base.origin !== 'https://example.invalid' || !base.pathname.endsWith('/')) {
  throw new Error('Expected a Pages base path such as /cesiumlab/.');
}

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.(?:js|css))"/g)]
  .map(([, path]) => new URL(path, base));
for (const extension of ['.js', '.css']) {
  if (!assets.some(({ pathname }) => pathname.endsWith(extension))) {
    throw new Error('Missing a built ' + extension + ' entry in index.html.');
  }
}

for (const asset of assets) {
  if (asset.origin !== base.origin || !asset.pathname.startsWith(base.pathname)) {
    throw new Error('Asset is outside the Pages base path: ' + asset.href);
  }
  const file = resolve(dist, asset.pathname.slice(base.pathname.length));
  if (!statSync(file).isFile()) throw new Error('Expected a built file: ' + file);
}

for (const directory of ['Assets', 'ThirdParty', 'Widgets', 'Workers']) {
  if (!statSync(resolve(dist, 'cesium-assets', directory)).isDirectory()) {
    throw new Error('Missing Cesium asset directory: ' + directory);
  }
}

for (const file of readdirSync(dist, { recursive: true })) {
  if (/(^|[\\/])(?:\.env(?:\.|$)|target\.png$)|\.map$/i.test(file)) {
    throw new Error('Unexpected public artifact: ' + file);
  }
}

console.log('Verified Playground assets under ' + base.pathname);
