import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite-plus';

const ASSET_PATH = 'cesium-assets/';
const ASSET_FOLDERS = ['Assets', 'ThirdParty', 'Widgets', 'Workers'];
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
};

function cesiumAssets(): Plugin {
  const directory = fileURLToPath(
    new URL('./Build/Cesium/', import.meta.resolve('cesium/package.json')),
  );
  const files = ASSET_FOLDERS.flatMap((folder) =>
    globSync('**/*', { cwd: join(directory, folder), withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = join(entry.parentPath, entry.name);
        return [ASSET_PATH + relative(directory, file).replaceAll('\\', '/'), file] as const;
      }),
  );

  return {
    name: 'cesium-assets',
    configureServer(server) {
      const routes = new Map(
        files.map(([name, file]) => [server.config.base + encodeURI(name), file]),
      );
      const prefix = server.config.base + ASSET_PATH;
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path?.startsWith(prefix) || (request.method !== 'GET' && request.method !== 'HEAD')) {
          return next();
        }

        const file = routes.get(path);
        if (!file) {
          response.statusCode = 404;
          response.end();
          return;
        }

        try {
          const contents = await readFile(file);
          response.setHeader(
            'Content-Type',
            MIME_TYPES[extname(file)] ?? 'application/octet-stream',
          );
          response.end(contents);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const [fileName, path] of files) {
        this.emitFile({ type: 'asset', fileName, source: await readFile(path) });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), tailwindcss(), cesiumAssets()],
  resolve: { tsconfigPaths: command === 'serve' },
}));
