# React 19 + StyleX + Astryx Y2K Playground Migration

## Purpose

Replace the previous Vue UI with native React 19 and the Meta Astryx React component system. This is a real framework migration, **not** a CSS-only port or compatibility wrapper.

## Actual packages

- React 19 and React DOM 19 (Vite React plugin)
- `@astryxdesign/core` with `Button`, `Card`, `Badge`, and the `Theme` provider
- `@astryxdesign/theme-y2k/built` plus the officially published Y2K theme CSS
- `@stylexjs/stylex` compiled with `@stylexjs/unplugin` in Vite
- Poppins / Crimson Text / JetBrains Mono webfonts with system fallbacks

The page layout draws its visual language from the real Astryx Y2K theme: periwinkle #CCCFFA, neon green #C5E17A, airy blue #ADDBFF, warm neutral #FFF6ED, charcoal ink, strong squared borders and a playful early-web feel.

## Architecture and what does not change

- `experiments/` (including `earth-network-convergence`) is **untouched**.
- No experimental GLSL, Cesium geometry, camera, screenshot baseline, or effect output was altered.
- `catalog/registry.ts`, `experiments/loader.ts`, experiment contracts and JSON metadata are reused directly.
- Hash routes remain `#/` and `#/experiments/:id`, working under both root and `/cesiumlab/` base URLs.
- CESIUM_BASE_URL is set **before** the dynamic Cesium import. Viewer cleans up on unmount, reload, pagehide and BFCache restoration.
- Screenshot capture URL remains `/?capture=1&paused=1&terrain-off#/experiments/earth-network-convergence`; its full-viewport canvas remains isolated from UI.
- The homepage SVG globe is a *concept illustration*, visibly labelled as such. Its action links to the real Cesium Viewer. Private visual-reference assets are not redistributed.
- Gallery reflects real metadata: 3 registered archives, 2 runnable entries and 1 visual-approved experiment (at time of implementation). No fake effects are introduced.

## Review / regression checklist

1. `pnpm install --frozen-lockfile` after the lock refresh.
2. `pnpm check` for formatting, lint, strict TypeScript, unit tests, production build.
3. `pnpm test:e2e` including Gallery → Smoke Test → Reload → Archive; confirm WebGL-off case.
4. `pnpm test:e2e:stage4` including direct S2-001 URL, archive, history navigation and one-canvas invariant.
5. `pnpm test:e2e:base` for `/cesiumlab/` Cesium Workers and Assets.
6. `pnpm test:e2e:stage2` to compare approved screenshot geometry and pause/terrain/camera controls.
7. Manual check at desktop, tablet and phone sizes, keyboard accessibility and reduced motion.

## Dependency lock workflow

The migration changes the dependency graph substantially. A temporary migration-branch-only workflow is provided to run `pnpm install --no-frozen-lockfile`, format migrated files, commit the exact lockfile on this feature branch, and run `pnpm check`. It does **not** deploy the site. **Remove the temporary workflow before merging** after the lockfile is generated and checks pass.

The production Pages workflow continues to require an explicit `DEPLOY` confirmation and continues to install with `--frozen-lockfile`. Review and merge of this PR do not publish a new site.

## Source and licensing

- https://github.com/meta/astryx
- https://github.com/meta/astryx/tree/main/packages/themes/y2k
- https://stylexjs.com/docs/learn/installation/vite/

No copy of the private visual reference is checked in. Upstream Astryx remains separately licensed under MIT.
