# First GitHub Pages Deployment

**Status: deployed and publicly smoke-tested**
**URL: <https://lumizora.github.io/cesiumlab/>**
**Commit: `0de165e5d4013090307643a2b99895c61d19e334`**
**Workflow run: [42557732534](https://github.com/lumizora/cesiumlab/actions/runs/42557732534)**

## Deployment

| Item                  | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Platform              | GitHub Pages, `build_type=workflow`                                       |
| HTTPS                 | enforced                                                                  |
| Pages artifact        | 357 files / 12.57 MiB                                                     |
| Base path             | `/cesiumlab/`                                                             |
| Actual built revision | `0de165e` (also embedded in the JS bundle and shown in the header)        |
| Environment           | `github-pages` with `lumizora` required reviewer and `main` branch policy |
| Ion variable          | `CESIUM_ION_TOKEN` configured; assets 1/2/3 returned HTTP 200             |
| Deployment status     | success                                                                   |

The first workflow attempt failed at checkout because a short SHA was passed to
`actions/checkout` and was interpreted as a branch name. No build or deploy
occurred. The retry used the full 40-character SHA and succeeded.

## Public smoke

Run at 2026-11-09T03:52:44Z with Microsoft Edge 157 headless:

- Gallery: 3 cards, 1 Visual Approved;
- S2-001 default showcase: `terrain=world-terrain`, `imagery=night-lights-4096`,
  `stage2State=visual-approved`;
- S2-001 control frame: paused, ellipsoid, deterministic;
- Control-frame RMSE against the approved baseline: **0.0103965 (about 1.04%)**,
  differences concentrated in star-field/anti-aliasing pixels;
- 0 console errors, 0 page errors, 0 failed requests, 0 network noise;
- HTTP 200 for HTML, JS, CSS, Cesium Workers, Assets, Widgets and ThirdParty;
- HSTS present; GitHub Pages cache is `max-age=600`; no custom CSP/security
  headers are available on GitHub Pages.

Evidence:

- [`gallery-public.png`](./gallery-public.png)
- [`s2-001-public-showcase.png`](./s2-001-public-showcase.png)
- [`s2-001-public-control.png`](./s2-001-public-control.png)
- [`public-smoke-report.json`](./public-smoke-report.json)
- [`http-checks.txt`](./http-checks.txt)
- [`headers.txt`](./headers.txt)

## Rollback

Stable tag: `deploy-2026-11-09-0de165e` (annotated at `0de165e`).

```powershell
gh workflow run deploy-pages.yml `
  --repo lumizora/cesiumlab `
  -f ref=deploy-2026-11-09-0de165e `
  -f confirm=DEPLOY
```

`actions/checkout` needs a full SHA or a ref/tag; short SHAs are treated as branch
names. The tag is a safe rollback ref. GitHub Pages deployment history and the
30-day artifact retention are additional recovery paths.

## Known limits

- GitHub Pages cannot set custom CSP, `X-Frame-Options`, `Permissions-Policy`, or
  custom cache headers.
- No Firefox/Safari/mobile public smoke.
- The ion token has read access to 32 assets; origin/asset restrictions still need
  to be checked in the Cesium ion dashboard.
- Public screenshots are captured from a headless Edge session, not a physical
  device matrix.
