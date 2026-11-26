import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  Model,
  Transforms,
  createOsmBuildingsAsync,
  type Cesium3DTileset,
  type Viewer,
} from '@cesiumlab/cesium';
import {
  Button,
  Card,
  Code,
  CodeBlock,
  Divider,
  HStack,
  Heading,
  Icon,
  StackItem,
  Text,
  VStack,
} from '@astryxdesign/core';
import { Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { hasCesiumIonToken } from '@docs/lib/cesium';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createBuildingStyle,
  type BuildingStyleHandle,
  type BuildingStylePreset,
  type BuildingStyleTarget,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'building-style',
  title: '3D Building Style',
  section: 'Visual Effects',
  description:
    'Pure-GPU CustomShader for Cesium 3D Tilesets & Models with height gradients, rising holographic scan halos, procedural night windows, and rooftop rim glow.',
  isNew: true,
  order: 17,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createOsmBuildingsAsync } from '@cesiumlab/cesium';
import { createBuildingStyle } from '@cesiumlab/effects';

const buildings = await createOsmBuildingsAsync();
viewer.scene.primitives.add(buildings);

const style = createBuildingStyle(viewer, {
  tileset: buildings,
  referencePosition: [121.5016, 31.2397],
  preset: 'cyber',      // 'cyber' | 'holo' | 'night-glow' | 'thermal'
  maxHeight: 260,
  scanSpeed: 1,
  windowGlow: 0.85,
  roofHighlight: 0.9,
});

// O(1) live preset & parameter updates (zero shader recompile)
style.update({ preset: 'night-glow', windowGlow: 1.1 });

// Cleanly restores the tileset's previous customShader
style.destroy();`;

// Shanghai Lujiazui CBD skyline
const CENTER_COORD: readonly [number, number] = [121.5016, 31.2397];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 110),
    new HeadingPitchRange(CesiumMath.toRadians(35), CesiumMath.toRadians(-24), 1_650),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

/**
 * Generates an in-memory glTF 2.0 CBD skyline (85 procedural skyscrapers & podiums)
 * so the demo works with full `CustomShader` fidelity even without a Cesium ion token.
 */
function buildProceduralCbdGltf(): Record<string, unknown> {
  let seed = 42019;
  const rand = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };

  interface BoxDef {
    cx: number;
    cz: number;
    w: number;
    d: number;
    h: number;
  }

  const boxes: BoxDef[] = [
    // Landmark supertall core towers
    { cx: 0, cz: 0, w: 64, d: 64, h: 360 },
    { cx: -115, cz: 48, w: 56, d: 56, h: 295 },
    { cx: 108, cz: -38, w: 62, d: 48, h: 325 },
    { cx: -42, cz: -128, w: 52, d: 52, h: 240 },
    { cx: 142, cz: 92, w: 58, d: 50, h: 225 },
  ];

  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue;
      if (rand() < 0.22) continue;
      const cx = gx * 98 + (rand() - 0.5) * 28;
      const cz = gz * 98 + (rand() - 0.5) * 28;
      const dist = Math.hypot(cx, cz);
      const falloff = Math.exp(-(dist * dist) / (2 * 280 * 280));
      const w = 30 + rand() * 34;
      const d = 30 + rand() * 34;
      const h = 36 + (50 + rand() * 195) * (0.35 + 0.65 * falloff);
      boxes.push({ cx, cz, w, d, h });
    }
  }

  // glTF is Y-up: X = East, Y = Up (height), Z = South
  const vertCount = boxes.length * 24;
  const idxCount = boxes.length * 36;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint16Array(idxCount);

  let v = 0;
  let idx = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    n: [number, number, number],
  ) => {
    const base = v;
    const pts = [p0, p1, p2, p3];
    for (const p of pts) {
      positions[v * 3] = p[0];
      positions[v * 3 + 1] = p[1];
      positions[v * 3 + 2] = p[2];
      normals[v * 3] = n[0];
      normals[v * 3 + 1] = n[1];
      normals[v * 3 + 2] = n[2];
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] > maxZ) maxZ = p[2];
      v++;
    }
    indices[idx++] = base;
    indices[idx++] = base + 1;
    indices[idx++] = base + 2;
    indices[idx++] = base;
    indices[idx++] = base + 2;
    indices[idx++] = base + 3;
  };

  for (const b of boxes) {
    const x0 = b.cx - b.w * 0.5;
    const x1 = b.cx + b.w * 0.5;
    const z0 = b.cz - b.d * 0.5;
    const z1 = b.cz + b.d * 0.5;
    const y0 = 0;
    const y1 = b.h;
    // +Z front
    pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    // -Z back
    pushQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    // +X right
    pushQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    // -X left
    pushQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    // +Y roof
    pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    // -Y base
    pushQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }

  const posBytes = new Uint8Array(positions.buffer);
  const normBytes = new Uint8Array(normals.buffer);
  const idxBytes = new Uint8Array(indices.buffer);
  const totalBytes = posBytes.byteLength + normBytes.byteLength + idxBytes.byteLength;
  const combined = new Uint8Array(totalBytes);
  combined.set(posBytes, 0);
  combined.set(normBytes, posBytes.byteLength);
  combined.set(idxBytes, posBytes.byteLength + normBytes.byteLength);

  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < combined.length; i += chunk) {
    binary += String.fromCharCode(...combined.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
          },
        ],
      },
    ],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${base64}`,
        byteLength: totalBytes,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength,
        byteLength: normBytes.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength + normBytes.byteLength,
        byteLength: idxBytes.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: idxCount,
        type: 'SCALAR',
      },
    ],
  };
}

const DEFAULTS = {
  preset: 'cyber' as BuildingStylePreset,
  maxHeight: 280,
  scanSpeed: 1,
  scanWidth: 18,
  windowGlow: 0.85,
  roofHighlight: 0.9,
  opacity: 1,
} as const;

export default function BuildingStyleDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const styleRef = useRef<BuildingStyleHandle | null>(null);

  const [preset, setPreset] = useState<BuildingStylePreset>(DEFAULTS.preset);
  const [maxHeight, setMaxHeight] = useState<number>(DEFAULTS.maxHeight);
  const [scanSpeed, setScanSpeed] = useState<number>(DEFAULTS.scanSpeed);
  const [scanWidth, setScanWidth] = useState<number>(DEFAULTS.scanWidth);
  const [windowGlow, setWindowGlow] = useState<number>(DEFAULTS.windowGlow);
  const [roofHighlight, setRoofHighlight] = useState<number>(DEFAULTS.roofHighlight);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);

  const handleMount = useCallback(
    async (viewer: Viewer, signal: AbortSignal) => {
      viewerRef.current = viewer;
      resetCamera(viewer);

      let target: BuildingStyleTarget | null = null;
      if (hasCesiumIonToken()) {
        try {
          const osm: Cesium3DTileset = await createOsmBuildingsAsync();
          if (signal.aborted || viewer.isDestroyed()) {
            osm.destroy();
            return;
          }
          viewer.scene.primitives.add(osm);
          target = osm;
        } catch {
          target = null;
        }
      }

      if (!target) {
        const modelMatrix = Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 0),
        );
        const gltfBlob = new Blob([JSON.stringify(buildProceduralCbdGltf())], {
          type: 'model/gltf+json',
        });
        const gltfUrl = URL.createObjectURL(gltfBlob);
        let model: Model;
        try {
          model = await Model.fromGltfAsync({
            url: gltfUrl,
            modelMatrix,
          });
        } finally {
          URL.revokeObjectURL(gltfUrl);
        }
        if (signal.aborted || viewer.isDestroyed()) {
          model.destroy();
          return;
        }
        viewer.scene.primitives.add(model);
        target = model;
      }

      const handle = createBuildingStyle(viewer, {
        tileset: target,
        referencePosition: CENTER_COORD,
        preset,
        maxHeight,
        scanSpeed,
        scanWidth,
        windowGlow,
        roofHighlight,
        opacity,
        show: visible,
        paused,
      });
      styleRef.current = handle;

      return () => {
        handle.destroy();
        if (target && !viewer.isDestroyed()) {
          viewer.scene.primitives.remove(target);
        }
        styleRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once; live updates flow through handle.update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    styleRef.current?.update({
      preset,
      maxHeight,
      scanSpeed,
      scanWidth,
      windowGlow,
      roofHighlight,
      opacity,
    });
  }, [preset, maxHeight, scanSpeed, scanWidth, windowGlow, roofHighlight, opacity]);

  useEffect(() => {
    styleRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    styleRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetParams = useCallback(() => {
    setPreset(DEFAULTS.preset);
    setMaxHeight(DEFAULTS.maxHeight);
    setScanSpeed(DEFAULTS.scanSpeed);
    setScanWidth(DEFAULTS.scanWidth);
    setWindowGlow(DEFAULTS.windowGlow);
    setRoofHighlight(DEFAULTS.roofHighlight);
    setOpacity(DEFAULTS.opacity);
  }, []);

  const hasModifiedParams =
    preset !== DEFAULTS.preset ||
    maxHeight !== DEFAULTS.maxHeight ||
    scanSpeed !== DEFAULTS.scanSpeed ||
    scanWidth !== DEFAULTS.scanWidth ||
    windowGlow !== DEFAULTS.windowGlow ||
    roofHighlight !== DEFAULTS.roofHighlight ||
    opacity !== DEFAULTS.opacity;

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'preset',
        label: isZh ? '赛博风格预设' : 'Style Preset',
        controls: [
          {
            type: 'segment',
            id: 'preset',
            label: isZh ? '建筑风格' : 'Preset',
            value: preset,
            options: [
              { value: 'cyber', label: isZh ? '赛博青' : 'Cyber' },
              { value: 'holo', label: isZh ? '全息网格' : 'Holo' },
              { value: 'night-glow', label: isZh ? '夜景暖窗' : 'Night' },
              { value: 'thermal', label: isZh ? '热力霓虹' : 'Thermal' },
            ],
            onChange: (val) => {
              if (val === 'cyber' || val === 'holo' || val === 'night-glow' || val === 'thermal') {
                setPreset(val);
              }
            },
          },
          {
            type: 'slider',
            id: 'maxHeight',
            label: isZh ? `高度映射上限 · ${maxHeight}m` : `Height ceiling · ${maxHeight}m`,
            value: maxHeight,
            min: 80,
            max: 500,
            step: 20,
            onChange: setMaxHeight,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.3,
            max: 1,
            step: 0.05,
            onChange: setOpacity,
          },
        ],
      },
      {
        id: 'lighting',
        label: isZh ? '立面窗格与屋顶' : 'Facade & Crown',
        controls: [
          {
            type: 'slider',
            id: 'windowGlow',
            label: isZh
              ? `夜间窗格亮度 · ${Math.round(windowGlow * 100)}%`
              : `Window glow · ${Math.round(windowGlow * 100)}%`,
            value: windowGlow,
            min: 0,
            max: 1.5,
            step: 0.05,
            onChange: setWindowGlow,
          },
          {
            type: 'slider',
            id: 'roofHighlight',
            label: isZh
              ? `屋顶轮廓高光 · ${Math.round(roofHighlight * 100)}%`
              : `Roof highlight · ${Math.round(roofHighlight * 100)}%`,
            value: roofHighlight,
            min: 0,
            max: 1.5,
            step: 0.05,
            onChange: setRoofHighlight,
          },
        ],
      },
      {
        id: 'scan',
        label: isZh ? '全息扫描光环' : 'Holographic Scan',
        controls: [
          {
            type: 'slider',
            id: 'scanSpeed',
            label: isZh
              ? `上升速度 · ${scanSpeed.toFixed(1)}x`
              : `Scan speed · ${scanSpeed.toFixed(1)}x`,
            value: scanSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setScanSpeed,
          },
          {
            type: 'slider',
            id: 'scanWidth',
            label: isZh ? `光环厚度 · ${scanWidth}m` : `Scan width · ${scanWidth}m`,
            value: scanWidth,
            min: 6,
            max: 50,
            step: 2,
            onChange: setScanWidth,
          },
        ],
      },
    ],
    [isZh, preset, maxHeight, opacity, windowGlow, roofHighlight, scanSpeed, scanWidth],
  );

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '3D 建筑赛博流光 (Building Style)' : meta.title;
  const pageDescription = isZh
    ? '基于 Cesium 原生 CustomShader 的零贴图纯 GPU 城市建筑着色器：支持任意 3D Tileset（如 OSM Buildings）与 glTF 模型，内置高度渐变、自下而上全息扫描光环、程序化夜间窗格灯光矩阵及屋顶轮廓高光。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'tileset',
          type: 'Cesium3DTileset | Model',
          defaultValue: 'required',
          description: '目标建筑 3D Tileset（如 OSM Buildings）或 glTF Model 实例。',
        },
        {
          property: 'referencePosition',
          type: '[lng, lat]',
          defaultValue: 'auto',
          description: '用于建立局部 ENU 垂向坐标系的参考经纬度，省略时自动取包围球中心。',
        },
        {
          property: 'preset',
          type: "'cyber' | 'holo' | 'night-glow' | 'thermal'",
          defaultValue: "'cyber'",
          description: '内置 4 套城市建筑赛博/夜景风格预设（O(1) 实时切换）。',
        },
        {
          property: 'baseColor / topColor / scanColor / windowColor',
          type: 'Color | string',
          defaultValue: 'preset',
          description: '自定义底部色、顶部色、扫描光环色与窗格灯光色。',
        },
        {
          property: 'baseElevation / maxHeight',
          type: 'number',
          defaultValue: '0 / 240',
          description: '地面参考高程与高度渐变归一化上限（米）。',
        },
        {
          property: 'scanSpeed / scanWidth',
          type: 'number',
          defaultValue: '1 / 18',
          description: '全息扫描光环上升速度倍率（0 关闭）与光带厚度（米）。',
        },
        {
          property: 'windowGlow / roofHighlight / opacity',
          type: 'number',
          defaultValue: '0.75 / 0.85 / 1',
          description: '程序化立面窗格亮度、屋顶/轮廓高光强度与整体不透明度。',
        },
        {
          property: 'show / hide / update / destroy',
          type: 'BuildingStyleHandle',
          defaultValue: '—',
          description: '统一句柄方法；隐藏或销毁时自动无损恢复 tileset 原有 customShader。',
        },
      ]
    : [
        {
          property: 'tileset',
          type: 'Cesium3DTileset | Model',
          defaultValue: 'required',
          description: 'Target 3D Tileset (e.g. OSM Buildings) or glTF Model instance.',
        },
        {
          property: 'referencePosition',
          type: '[lng, lat]',
          defaultValue: 'auto',
          description: 'Reference [lng, lat] for local ENU vertical height calculation.',
        },
        {
          property: 'preset',
          type: "'cyber' | 'holo' | 'night-glow' | 'thermal'",
          defaultValue: "'cyber'",
          description: 'Built-in architectural style preset (O(1) live uniform switch).',
        },
        {
          property: 'baseColor / topColor / scanColor / windowColor',
          type: 'Color | string',
          defaultValue: 'preset',
          description: 'Custom overrides for base, crown, scan halo, and window glow colors.',
        },
        {
          property: 'baseElevation / maxHeight',
          type: 'number',
          defaultValue: '0 / 240',
          description: 'Ground reference altitude and vertical gradient height ceiling in metres.',
        },
        {
          property: 'scanSpeed / scanWidth',
          type: 'number',
          defaultValue: '1 / 18',
          description:
            'Rising scan ring speed multiplier (`0` disables) and band thickness in metres.',
        },
        {
          property: 'windowGlow / roofHighlight / opacity',
          type: 'number',
          defaultValue: '0.75 / 0.85 / 1',
          description:
            'Procedural facade window intensity, rooftop/rim highlight, and overall opacity.',
        },
        {
          property: 'show / hide / update / destroy',
          type: 'BuildingStyleHandle',
          defaultValue: '—',
          description:
            'Unified handle methods; cleanly restores prior customShader on hide or destroy.',
        },
      ];

  useDocsPageMarkdown(
    formatEffectDocMarkdown({
      title: pageTitle,
      description: pageDescription,
      installCmd: INSTALL_CMD,
      usageCode: USAGE_CODE,
      apiProperties,
      isZh,
    }),
  );

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <Heading level={1} textWrap="balance">
          {pageTitle}
        </Heading>
        <Text type="body" color="secondary">
          {pageDescription}
        </Text>
      </VStack>

      <CesiumStage
        label={
          isZh ? 'Building Style 3D 城市建筑流光演示场景' : 'Building Style 3D CesiumJS demo scene'
        }
        shouldAnimate={false}
        terrain={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={paused ? (isZh ? '播放' : 'Play') : isZh ? '暂停' : 'Pause'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={paused ? Play : Pause} />}
              onClick={() => setPaused((prev) => !prev)}
            />
            <Button
              label={visible ? (isZh ? '还原白膜' : 'Restore') : isZh ? '启用流光' : 'Enable'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={visible ? EyeOff : Eye} />}
              onClick={() => setVisible((prev) => !prev)}
            />
            <Button
              label={isZh ? '重置视角' : 'Reset camera'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={RotateCcw} />}
              onClick={handleResetCamera}
            />
          </>
        }
      />

      <VStack gap={4}>
        <Heading level={2}>{isZh ? '安装' : 'Install'}</Heading>
        <CodeBlock code={INSTALL_CMD} language="bash" width="100%" />
      </VStack>

      <VStack gap={4}>
        <Heading level={2}>{isZh ? '用法' : 'Usage'}</Heading>
        <CodeBlock code={USAGE_CODE} language="ts" width="100%" />
      </VStack>

      <VStack gap={2} paddingBlockEnd={8}>
        <Heading level={2}>{isZh ? 'API 参考' : 'API reference'}</Heading>

        <HStack paddingInline={4} paddingBlock={2} gap={4} vAlign="center">
          <StackItem size="fill">
            <Text type="label" color="secondary">
              {isZh ? '属性' : 'Property'}
            </Text>
          </StackItem>
          <HStack width={140} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '类型' : 'Type'}
            </Text>
          </HStack>
          <HStack width={130} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '默认值' : 'Default'}
            </Text>
          </HStack>
        </HStack>

        <Card padding={0} width="100%">
          <VStack gap={0}>
            {apiProperties.map((prop, idx) => (
              <Fragment key={prop.property}>
                {idx > 0 && <Divider />}
                <VStack gap={2} padding={4}>
                  <HStack gap={4} vAlign="center">
                    <StackItem size="fill">
                      <Text type="code" weight="medium">
                        {prop.property}
                      </Text>
                    </StackItem>
                    <HStack width={140} vAlign="center">
                      <Code color="secondary">{prop.type}</Code>
                    </HStack>
                    <HStack width={130} vAlign="center">
                      <Code color="secondary">{prop.defaultValue}</Code>
                    </HStack>
                  </HStack>
                  <Text type="body" color="secondary">
                    {prop.description}
                  </Text>
                </VStack>
              </Fragment>
            ))}
          </VStack>
        </Card>
      </VStack>
    </VStack>
  );
}
