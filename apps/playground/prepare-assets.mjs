import { cp, mkdir } from 'node:fs/promises';

const cesium = new URL('./Build/Cesium/', import.meta.resolve('cesium/package.json'));
const target = new URL('./public/cesium-assets/', import.meta.url);

await mkdir(target, { recursive: true });
await Promise.all(
  ['Assets', 'ThirdParty', 'Widgets', 'Workers'].map((directory) =>
    cp(new URL(directory, cesium), new URL(directory, target), { recursive: true }),
  ),
);
