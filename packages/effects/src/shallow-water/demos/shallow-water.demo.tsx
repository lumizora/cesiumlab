import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from 'cesium';
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
import { Droplets, Eye, EyeOff, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import type { GeographicBounds } from '../../fluid-simulation/index.ts';
import {
  createShallowWater,
  type ShallowWaterHandle,
  type ShallowWaterMode,
  type ShallowWaterTerrainPreset,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'shallow-water',
  title: 'Shallow Water',
  section: 'Visual Effects',
  description:
    'Real-time WebGL2 Ping-Pong FBO 2D Shallow Water Equations (SWE) solver supporting terrain-reflecting wave ripples and gravity-driven virtual-pipe valley water flow.',
  isNew: true,
  order: 12,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createShallowWater } from '@cesiumlab/effects';

const water = createShallowWater(viewer, {
  bounds: [103.52, 31.38, 103.68, 31.52], // [west, south, east, north]
  height: 1580,
  mode: 'ripples', // 'ripples' | 'flow'
  terrainPreset: 'globe', // samples Cesium terrain when loaded
  waveSpeed: 1.1,
  damping: 0.012,
  shallowColor: '#22d3ee',
  deepColor: '#0b3a66',
});

// Trigger a physical ripple or pour water at any [lng, lat] inside bounds
water.drop([103.60, 31.45], 0.9, 0.045);
water.update({ mode: 'flow', waveSpeed: 1.4 });
water.syncTerrain();
water.destroy();`;

const DEMO_BOUNDS: GeographicBounds = [103.52, 31.38, 103.68, 31.52];
const DEMO_HEIGHT = 1_580;

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(103.6, 31.45, DEMO_HEIGHT),
    new HeadingPitchRange(CesiumMath.toRadians(22), CesiumMath.toRadians(-38), 15_500),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  mode: 'ripples' as ShallowWaterMode,
  terrainPreset: 'globe' as ShallowWaterTerrainPreset,
  waveSpeed: 1.1,
  damping: 0.012,
  waterLevel: 0.52,
  shallowColor: '#22d3ee',
  deepColor: '#0b3a66',
  specularIntensity: 1.0,
  foamIntensity: 0.85,
  speed: 1,
  opacity: 0.94,
  autoEmit: true,
} as const;

export default function ShallowWaterDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const waterRef = useRef<ShallowWaterHandle | null>(null);
  const interactModeRef = useRef(false);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [interactMode, setInteractMode] = useState(false);

  const [mode, setMode] = useState<ShallowWaterMode>(DEFAULTS.mode);
  const [terrainPreset, setTerrainPreset] = useState<ShallowWaterTerrainPreset>(
    DEFAULTS.terrainPreset,
  );
  const [waveSpeed, setWaveSpeed] = useState<number>(DEFAULTS.waveSpeed);
  const [damping, setDamping] = useState<number>(DEFAULTS.damping);
  const [waterLevel, setWaterLevel] = useState<number>(DEFAULTS.waterLevel);
  const [shallowColor, setShallowColor] = useState<string>(DEFAULTS.shallowColor);
  const [deepColor, setDeepColor] = useState<string>(DEFAULTS.deepColor);
  const [specularIntensity, setSpecularIntensity] = useState<number>(DEFAULTS.specularIntensity);
  const [foamIntensity, setFoamIntensity] = useState<number>(DEFAULTS.foamIntensity);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [autoEmit, setAutoEmit] = useState<boolean>(DEFAULTS.autoEmit);

  interactModeRef.current = interactMode;

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      waterRef.current = createShallowWater(viewer, {
        bounds: DEMO_BOUNDS,
        height: DEMO_HEIGHT,
        mode,
        terrainPreset,
        waveSpeed,
        damping,
        waterLevel,
        shallowColor,
        deepColor,
        specularIntensity,
        foamIntensity,
        speed,
        opacity,
        autoEmit,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      let dragging = false;

      const pickLngLat = (screenPos: {
        x: number;
        y: number;
      }): readonly [number, number] | null => {
        const pos = screenPos as Parameters<typeof viewer.scene.pickPosition>[0];
        const cartesian =
          (viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : undefined) ??
          viewer.camera.pickEllipsoid(pos, viewer.scene.ellipsoid);
        if (!cartesian) return null;
        const carto = Cartographic.fromCartesian(cartesian, viewer.scene.ellipsoid);
        return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
      };

      handler.setInputAction((event: { position: { x: number; y: number } }) => {
        if (!interactModeRef.current) return;
        dragging = true;
        const coord = pickLngLat(event.position);
        if (coord) {
          waterRef.current?.drop(coord, 1.0, 0.045);
        }
      }, ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((event: { endPosition: { x: number; y: number } }) => {
        if (!dragging || !interactModeRef.current) return;
        const coord = pickLngLat(event.endPosition);
        if (coord) {
          waterRef.current?.drop(coord, 0.72, 0.038);
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);

      const stopDrag = () => {
        dragging = false;
      };
      handler.setInputAction(stopDrag, ScreenSpaceEventType.LEFT_UP);

      return () => {
        handler.destroy();
        waterRef.current?.destroy();
        waterRef.current = null;
        viewerRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Lock camera orbit while interactive drop/pour mode is active so clicks & drags hit the water
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = !interactMode;
    ctrl.enableTranslate = !interactMode;
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
      }
    };
  }, [interactMode]);

  useEffect(() => {
    waterRef.current?.update({
      mode,
      terrainPreset,
      waveSpeed,
      damping,
      waterLevel,
      shallowColor,
      deepColor,
      specularIntensity,
      foamIntensity,
      speed,
      opacity,
      autoEmit,
    });
  }, [
    mode,
    terrainPreset,
    waveSpeed,
    damping,
    waterLevel,
    shallowColor,
    deepColor,
    specularIntensity,
    foamIntensity,
    speed,
    opacity,
    autoEmit,
  ]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    waterRef.current?.setPaused(next);
  };

  const toggleVisible = () => {
    const next = !visible;
    setVisible(next);
    waterRef.current?.setVisible(next);
  };

  const handleResetParams = () => {
    setMode(DEFAULTS.mode);
    setTerrainPreset(DEFAULTS.terrainPreset);
    setWaveSpeed(DEFAULTS.waveSpeed);
    setDamping(DEFAULTS.damping);
    setWaterLevel(DEFAULTS.waterLevel);
    setShallowColor(DEFAULTS.shallowColor);
    setDeepColor(DEFAULTS.deepColor);
    setSpecularIntensity(DEFAULTS.specularIntensity);
    setFoamIntensity(DEFAULTS.foamIntensity);
    setSpeed(DEFAULTS.speed);
    setOpacity(DEFAULTS.opacity);
    setAutoEmit(DEFAULTS.autoEmit);
  };

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'physics-terrain',
        label: isZh ? '求解模式与地形' : 'Physics & Terrain',
        controls: [
          {
            type: 'segment',
            id: 'mode',
            label: isZh ? '仿真模式' : 'Simulation Mode',
            value: mode,
            options: [
              { value: 'ripples', label: isZh ? '涟漪反射' : 'Ripples' },
              { value: 'flow', label: isZh ? '地形水流' : 'Valley Flow' },
            ],
            onChange: (v) => setMode(v as ShallowWaterMode),
          },
          {
            type: 'segment',
            id: 'terrainPreset',
            label: isZh ? '地形高程源' : 'Terrain Source',
            value: terrainPreset,
            options: [
              { value: 'globe', label: isZh ? '球面地形' : 'Globe' },
              { value: 'basin', label: isZh ? '湖盆岛屿' : 'Basin' },
              { value: 'valley', label: isZh ? '峡谷沟壑' : 'Valley' },
              { value: 'flat', label: isZh ? '平坦水面' : 'Flat' },
            ],
            onChange: (v) => setTerrainPreset(v as ShallowWaterTerrainPreset),
          },
          {
            type: 'switch',
            id: 'autoEmit',
            label: isZh ? '自动波源 / 泉眼' : 'Auto Source',
            value: autoEmit,
            onChange: setAutoEmit,
          },
        ],
      },
      {
        id: 'dynamics',
        label: isZh ? '浅水动力学' : 'Shallow Water Dynamics',
        controls: [
          {
            type: 'slider',
            id: 'waveSpeed',
            label: isZh
              ? `波速 / 重力 · ${waveSpeed.toFixed(2)}x`
              : `Wave Speed · ${waveSpeed.toFixed(2)}x`,
            value: waveSpeed,
            min: 0.3,
            max: 2.2,
            step: 0.05,
            onChange: setWaveSpeed,
          },
          {
            type: 'slider',
            id: 'damping',
            label: isZh ? `能量阻尼 · ${damping.toFixed(3)}` : `Damping · ${damping.toFixed(3)}`,
            value: damping,
            min: 0.002,
            max: 0.06,
            step: 0.002,
            onChange: setDamping,
          },
          ...(mode === 'ripples'
            ? [
                {
                  type: 'slider' as const,
                  id: 'waterLevel',
                  label: isZh
                    ? `基准水位 · ${Math.round(waterLevel * 100)}%`
                    : `Water Level · ${Math.round(waterLevel * 100)}%`,
                  value: waterLevel,
                  min: 0.2,
                  max: 0.9,
                  step: 0.02,
                  onChange: setWaterLevel,
                },
              ]
            : []),
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `时间流速 · ${speed.toFixed(1)}x` : `Time Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 2.5,
            step: 0.1,
            onChange: setSpeed,
          },
        ],
      },
      {
        id: 'optics',
        label: isZh ? '光学着色与泡沫' : 'Optical Shading & Foam',
        controls: [
          {
            type: 'color',
            id: 'shallowColor',
            label: isZh ? '浅水色调' : 'Shallow Color',
            value: shallowColor,
            onChange: setShallowColor,
          },
          {
            type: 'color',
            id: 'deepColor',
            label: isZh ? '深水色调' : 'Deep Color',
            value: deepColor,
            onChange: setDeepColor,
          },
          {
            type: 'slider',
            id: 'specularIntensity',
            label: isZh
              ? `高光强度 · ${specularIntensity.toFixed(2)}`
              : `Specular · ${specularIntensity.toFixed(2)}`,
            value: specularIntensity,
            min: 0,
            max: 2,
            step: 0.05,
            onChange: setSpecularIntensity,
          },
          {
            type: 'slider',
            id: 'foamIntensity',
            label: isZh
              ? `浪花泡沫 · ${foamIntensity.toFixed(2)}`
              : `Foam · ${foamIntensity.toFixed(2)}`,
            value: foamIntensity,
            min: 0,
            max: 2,
            step: 0.05,
            onChange: setFoamIntensity,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `整体透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.2,
            max: 1,
            step: 0.02,
            onChange: setOpacity,
          },
        ],
      },
    ],
    [
      isZh,
      mode,
      terrainPreset,
      autoEmit,
      waveSpeed,
      damping,
      waterLevel,
      speed,
      shallowColor,
      deepColor,
      specularIntensity,
      foamIntensity,
      opacity,
    ],
  );

  const hasModifiedParams =
    mode !== DEFAULTS.mode ||
    terrainPreset !== DEFAULTS.terrainPreset ||
    waveSpeed !== DEFAULTS.waveSpeed ||
    damping !== DEFAULTS.damping ||
    waterLevel !== DEFAULTS.waterLevel ||
    shallowColor !== DEFAULTS.shallowColor ||
    deepColor !== DEFAULTS.deepColor ||
    specularIntensity !== DEFAULTS.specularIntensity ||
    foamIntensity !== DEFAULTS.foamIntensity ||
    speed !== DEFAULTS.speed ||
    opacity !== DEFAULTS.opacity ||
    autoEmit !== DEFAULTS.autoEmit;

  const apiProperties = useMemo(
    () =>
      isZh
        ? [
            {
              property: 'bounds',
              type: '[west, south, east, north]',
              defaultValue: '必填',
              description: '浅水方程求解区域经纬度范围（度）。',
            },
            {
              property: 'height',
              type: 'number',
              defaultValue: '1750',
              description: '水面参考海拔高度（米），与三维地形自然交切形成岸线。',
            },
            {
              property: 'mode',
              type: "'ripples' | 'flow'",
              defaultValue: "'ripples'",
              description:
                'ripples 为浅水波动方程（岸线反射与岛屿绕射）；flow 为虚拟管道重力水流演进。',
            },
            {
              property: 'terrainPreset',
              type: "'globe' | 'basin' | 'valley' | 'flat'",
              defaultValue: "'globe'",
              description:
                '高程场来源：globe 自动采样 Cesium 真实地形，未就绪时平滑回退至内置地形。',
            },
            {
              property: 'waveSpeed',
              type: 'number',
              defaultValue: '1.1',
              description: '波速 / 重力加速度倍率，浅水区自动按 c = √(g·d) 减速折射。',
            },
            {
              property: 'damping',
              type: 'number',
              defaultValue: '0.012',
              description: '波浪与流速阻尼衰减系数。',
            },
            {
              property: 'waterLevel',
              type: 'number',
              defaultValue: '0.52',
              description: 'ripples 模式基准水位（0.1–0.95），高于水位的山体作为反射岸线。',
            },
            {
              property: 'shallowColor / deepColor',
              type: 'Color | string',
              defaultValue: '#22d3ee / #0b3a66',
              description: 'Beer-Lambert 水深吸收渐变色（浅水青绿过渡到深水靛蓝）。',
            },
            {
              property: 'drop(pos, strength?, radius?)',
              type: 'method',
              defaultValue: '—',
              description: '在指定经纬度注入圆形波纹冲击（ripples）或实时注水（flow）。',
            },
            {
              property: 'syncTerrain() / clear()',
              type: 'method',
              defaultValue: '—',
              description: '手动重新采样 Cesium 球面高程场或立即清空水体缓冲。',
            },
          ]
        : [
            {
              property: 'bounds',
              type: '[west, south, east, north]',
              defaultValue: 'required',
              description: 'Geographic simulation rectangle in degrees.',
            },
            {
              property: 'height',
              type: 'number',
              defaultValue: '1750',
              description:
                'Reference altitude in metres where the water surface intersects 3D terrain.',
            },
            {
              property: 'mode',
              type: "'ripples' | 'flow'",
              defaultValue: "'ripples'",
              description:
                'ripples solves the 2D shallow-water wave equation with shoreline reflection; flow runs virtual-pipe gravity water routing.',
            },
            {
              property: 'terrainPreset',
              type: "'globe' | 'basin' | 'valley' | 'flat'",
              defaultValue: "'globe'",
              description:
                'Heightfield source. globe samples Cesium terrain automatically once loaded.',
            },
            {
              property: 'waveSpeed',
              type: 'number',
              defaultValue: '1.1',
              description: 'Wave propagation speed / gravity multiplier.',
            },
            {
              property: 'damping',
              type: 'number',
              defaultValue: '0.012',
              description: 'Wave and velocity damping coefficient.',
            },
            {
              property: 'waterLevel',
              type: 'number',
              defaultValue: '0.52',
              description:
                'Normalized water level [0.1–0.95] for shoreline masking in ripples mode.',
            },
            {
              property: 'shallowColor / deepColor',
              type: 'Color | string',
              defaultValue: '#22d3ee / #0b3a66',
              description:
                'Beer-Lambert depth absorption colors from shallow turquoise to deep navy.',
            },
            {
              property: 'drop(pos, strength?, radius?)',
              type: 'method',
              defaultValue: '—',
              description: 'Injects a physical ripple disturbance or water volume at [lng, lat].',
            },
            {
              property: 'syncTerrain() / clear()',
              type: 'method',
              defaultValue: '—',
              description:
                'Re-samples Cesium globe elevations or clears all fluid height/flux buffers.',
            },
          ],
    [isZh],
  );

  const pageTitle = isZh ? '地形浅水方程仿真 (Shallow Water)' : meta.title;
  const pageDescription = isZh
    ? '基于 WebGL2 Ping-Pong 浮点帧缓冲（RGBA16F）实现的真 2D 浅水方程（Shallow Water Equations）仿真：支持地形障碍岸线反射与绕射的涟漪模式，以及基于虚拟管道通量守恒的山地重力水流演进模式，并支持自动采样 Cesium 真实地形高程与鼠标点击交互造波 / 注水。'
    : meta.description;

  const pageMarkdown = useMemo(
    () =>
      formatEffectDocMarkdown({
        title: pageTitle,
        description: pageDescription,
        installCmd: INSTALL_CMD,
        usageCode: USAGE_CODE,
        apiProperties,
        isZh,
      }),
    [pageTitle, pageDescription, apiProperties, isZh],
  );
  useDocsPageMarkdown(pageMarkdown);

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
          isZh ? 'Shallow Water 地形浅水方程仿真演示场景' : 'Shallow Water 3D CesiumJS demo scene'
        }
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={
                interactMode
                  ? isZh
                    ? mode === 'ripples'
                      ? '退出造波'
                      : '退出注水'
                    : 'Orbit'
                  : isZh
                    ? mode === 'ripples'
                      ? '点击造波'
                      : '点击注水'
                    : mode === 'ripples'
                      ? 'Drop Ripples'
                      : 'Pour Water'
              }
              variant="ghost"
              size="sm"
              icon={<Icon icon={Droplets} />}
              onClick={() => setInteractMode((prev) => !prev)}
              style={interactMode ? { backgroundColor: 'rgba(255, 255, 255, 0.14)' } : undefined}
            />
            <Button
              label={isZh ? '清空' : 'Clear'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={Trash2} />}
              onClick={() => waterRef.current?.clear()}
            />
            <Button
              label={paused ? (isZh ? '继续' : 'Resume') : isZh ? '暂停' : 'Pause'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={paused ? Play : Pause} />}
              onClick={togglePause}
            />
            <Button
              label={visible ? (isZh ? '隐藏' : 'Hide') : isZh ? '显示' : 'Show'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={visible ? EyeOff : Eye} />}
              onClick={toggleVisible}
            />
            <Button
              label={isZh ? '重置视角' : 'Reset'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={RotateCcw} />}
              onClick={() => {
                if (viewerRef.current) resetCamera(viewerRef.current);
              }}
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
        <HStack gap={4} paddingInline={4} paddingBlock={2}>
          <StackItem size="fill">
            <Text type="label" color="secondary">
              {isZh ? '属性' : 'Property'}
            </Text>
          </StackItem>
          <HStack width={130} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '类型' : 'Type'}
            </Text>
          </HStack>
          <HStack width={110} vAlign="center">
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
                    <HStack width={130} vAlign="center">
                      <Code color="secondary">{prop.type}</Code>
                    </HStack>
                    <HStack width={110} vAlign="center">
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
