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
import { Eye, EyeOff, Hand, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createFluidSimulation,
  type FluidSimulationHandle,
  type GeographicBounds,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'fluid-simulation',
  title: 'Fluid Simulation',
  section: 'Visual Effects',
  description:
    'Real-time WebGL2 Ping-Pong FBO 2D Navier-Stokes incompressible fluid simulation with vorticity confinement, pressure projection, auto emitters, and interactive globe splatting.',
  isNew: true,
  order: 11,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createFluidSimulation } from '@cesiumlab/effects';

const fluid = createFluidSimulation(viewer, {
  bounds: [119.5, 29.2, 123.5, 32.8], // [west, south, east, north]
  primaryColor: '#00d4ff',
  secondaryColor: '#ff6b35',
  curl: 32,
  velocityDissipation: 0.25,
  dyeDissipation: 0.85,
  autoEmit: true,
});

// Inject custom velocity & dye splats at any [lng, lat] inside bounds
fluid.splat([121.47, 31.23], [600, 350], '#a855f7');
fluid.update({ curl: 48, speed: 1.4 });
fluid.clear();
fluid.destroy();`;

const DEMO_BOUNDS: GeographicBounds = [119.5, 29.2, 123.5, 32.8];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(121.5, 31.0, 2_500),
    new HeadingPitchRange(CesiumMath.toRadians(0), CesiumMath.toRadians(-58), 640_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  primaryColor: '#00d4ff',
  secondaryColor: '#ff6b35',
  curl: 32,
  velocityDissipation: 0.25,
  dyeDissipation: 0.85,
  splatRadius: 0.0045,
  speed: 1,
  opacity: 0.92,
  autoEmit: true,
} as const;

export default function FluidSimulationDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const fluidRef = useRef<FluidSimulationHandle | null>(null);
  const stirModeRef = useRef(false);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [stirMode, setStirMode] = useState(false);
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULTS.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState<string>(DEFAULTS.secondaryColor);
  const [curl, setCurl] = useState<number>(DEFAULTS.curl);
  const [velocityDissipation, setVelocityDissipation] = useState<number>(
    DEFAULTS.velocityDissipation,
  );
  const [dyeDissipation, setDyeDissipation] = useState<number>(DEFAULTS.dyeDissipation);
  const [splatRadius, setSplatRadius] = useState<number>(DEFAULTS.splatRadius);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [autoEmit, setAutoEmit] = useState<boolean>(DEFAULTS.autoEmit);

  stirModeRef.current = stirMode;

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      fluidRef.current = createFluidSimulation(viewer, {
        bounds: DEMO_BOUNDS,
        primaryColor,
        secondaryColor,
        curl,
        velocityDissipation,
        dyeDissipation,
        splatRadius,
        speed,
        opacity,
        autoEmit,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      let dragging = false;
      let lastCoord: readonly [number, number] | null = null;
      let hueStep = 0;

      const pickLngLat = (screenPos: {
        x: number;
        y: number;
      }): readonly [number, number] | null => {
        const cartesian = viewer.camera.pickEllipsoid(
          screenPos as Parameters<typeof viewer.camera.pickEllipsoid>[0],
          viewer.scene.ellipsoid,
        );
        if (!cartesian) return null;
        const carto = Cartographic.fromCartesian(cartesian, viewer.scene.ellipsoid);
        return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
      };

      handler.setInputAction((event: { position: { x: number; y: number } }) => {
        if (!stirModeRef.current) return;
        dragging = true;
        lastCoord = pickLngLat(event.position);
      }, ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((event: { endPosition: { x: number; y: number } }) => {
        if (!stirModeRef.current || !dragging) return;
        const current = pickLngLat(event.endPosition);
        if (current && lastCoord) {
          const dx = (current[0] - lastCoord[0]) * 950;
          const dy = (current[1] - lastCoord[1]) * 950;
          hueStep = (hueStep + 4) % 360;
          fluidRef.current?.splat(current, [dx, dy], `hsl(${hueStep}, 95%, 60%)`);
        }
        lastCoord = current;
      }, ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction(() => {
        dragging = false;
        lastCoord = null;
      }, ScreenSpaceEventType.LEFT_UP);

      return () => {
        handler.destroy();
        if (!viewer.isDestroyed()) {
          viewer.scene.screenSpaceCameraController.enableRotate = true;
        }
        fluidRef.current?.destroy();
        fluidRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.screenSpaceCameraController.enableRotate = !stirMode;
  }, [stirMode]);

  useEffect(() => {
    fluidRef.current?.update({
      primaryColor,
      secondaryColor,
      curl,
      velocityDissipation,
      dyeDissipation,
      splatRadius,
      speed,
      opacity,
      autoEmit,
    });
  }, [
    primaryColor,
    secondaryColor,
    curl,
    velocityDissipation,
    dyeDissipation,
    splatRadius,
    speed,
    opacity,
    autoEmit,
  ]);

  useEffect(() => {
    fluidRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    fluidRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    primaryColor !== DEFAULTS.primaryColor ||
    secondaryColor !== DEFAULTS.secondaryColor ||
    curl !== DEFAULTS.curl ||
    velocityDissipation !== DEFAULTS.velocityDissipation ||
    dyeDissipation !== DEFAULTS.dyeDissipation ||
    splatRadius !== DEFAULTS.splatRadius ||
    speed !== DEFAULTS.speed ||
    opacity !== DEFAULTS.opacity ||
    autoEmit !== DEFAULTS.autoEmit;

  const handleResetParams = useCallback(() => {
    setPrimaryColor(DEFAULTS.primaryColor);
    setSecondaryColor(DEFAULTS.secondaryColor);
    setCurl(DEFAULTS.curl);
    setVelocityDissipation(DEFAULTS.velocityDissipation);
    setDyeDissipation(DEFAULTS.dyeDissipation);
    setSplatRadius(DEFAULTS.splatRadius);
    setSpeed(DEFAULTS.speed);
    setOpacity(DEFAULTS.opacity);
    setAutoEmit(DEFAULTS.autoEmit);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '外观' : 'Appearance',
        controls: [
          {
            type: 'color',
            id: 'primaryColor',
            label: isZh ? '主喷口颜色' : 'Primary dye',
            value: primaryColor,
            onChange: setPrimaryColor,
          },
          {
            type: 'color',
            id: 'secondaryColor',
            label: isZh ? '副喷口颜色' : 'Secondary dye',
            value: secondaryColor,
            onChange: setSecondaryColor,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.25,
            max: 1.2,
            step: 0.05,
            onChange: setOpacity,
          },
          {
            type: 'switch',
            id: 'autoEmit',
            label: isZh ? '自动双涡旋喷口' : 'Auto vortex jets',
            value: autoEmit,
            onChange: setAutoEmit,
          },
        ],
      },
      {
        id: 'physics',
        label: isZh ? '流体物理' : 'Physics',
        controls: [
          {
            type: 'slider',
            id: 'curl',
            label: isZh ? `涡量增强 · ${curl}` : `Vorticity · ${curl}`,
            value: curl,
            min: 0,
            max: 60,
            step: 2,
            onChange: setCurl,
          },
          {
            type: 'slider',
            id: 'velocityDissipation',
            label: isZh
              ? `粘滞衰减 · ${velocityDissipation.toFixed(2)}`
              : `Viscosity · ${velocityDissipation.toFixed(2)}`,
            value: velocityDissipation,
            min: 0.05,
            max: 2,
            step: 0.05,
            onChange: setVelocityDissipation,
          },
          {
            type: 'slider',
            id: 'dyeDissipation',
            label: isZh
              ? `染料消散 · ${dyeDissipation.toFixed(2)}`
              : `Dye fade · ${dyeDissipation.toFixed(2)}`,
            value: dyeDissipation,
            min: 0.1,
            max: 2.5,
            step: 0.05,
            onChange: setDyeDissipation,
          },
          {
            type: 'slider',
            id: 'splatRadius',
            label: isZh
              ? `喷口半径 · ${(splatRadius * 1000).toFixed(1)}`
              : `Splat size · ${(splatRadius * 1000).toFixed(1)}`,
            value: splatRadius,
            min: 0.0015,
            max: 0.012,
            step: 0.0005,
            onChange: setSplatRadius,
          },
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `求解速度 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 2.5,
            step: 0.1,
            onChange: setSpeed,
          },
        ],
      },
    ],
    [
      isZh,
      primaryColor,
      secondaryColor,
      opacity,
      autoEmit,
      curl,
      velocityDissipation,
      dyeDissipation,
      splatRadius,
      speed,
    ],
  );

  const pageTitle = isZh ? 'Navier-Stokes 涡旋流体 (Fluid Simulation)' : meta.title;
  const pageDescription = isZh
    ? '基于独立 WebGL2 浮点 Ping-Pong FBO 的真·二维不可压缩 Navier-Stokes 流体求解器：完整执行半拉格朗日平流、涡量增强（Vorticity Confinement）、散度计算与 16 步压力泊松雅可比迭代，并贴合渲染至 Cesium 地球表面。开启「搅动」后可直接用鼠标在地球上划出绚丽涡旋。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'bounds',
          type: '[west, south, east, north]',
          defaultValue: 'required',
          description: '流体仿真覆盖的地理经纬度矩形范围（单位：度）。',
        },
        {
          property: 'primaryColor / secondaryColor',
          type: 'Color | string',
          defaultValue: "'#00d4ff' / '#ff6b35'",
          description: '自动对撞涡旋喷口的主色与副色。',
        },
        {
          property: 'curl',
          type: 'number',
          defaultValue: '32',
          description: '涡量约束（Vorticity Confinement）强度，越高涡旋卷曲越细腻丰富。',
        },
        {
          property: 'velocityDissipation / dyeDissipation',
          type: 'number',
          defaultValue: '0.25 / 0.85',
          description: '速度场粘滞衰减与染料浓度消散速率。',
        },
        {
          property: 'splatRadius / speed / opacity',
          type: 'number',
          defaultValue: '0.0045 / 1 / 0.92',
          description: '注入半径、求解时间步倍率与流体层整体不透明度。',
        },
        {
          property: 'autoEmit / resolution / height',
          type: 'boolean / number',
          defaultValue: 'true / 160 / 2500',
          description: '是否开启自动涡旋喷口、速度场网格分辨率与图层海拔高度（米）。',
        },
        {
          property: 'splat / clear / show / hide / update / destroy',
          type: 'FluidSimulationHandle',
          defaultValue: '—',
          description:
            '支持在任意经纬度注入速度与染料冲量、清空缓冲，以及统一 EffectHandle 生命周期。',
        },
      ]
    : [
        {
          property: 'bounds',
          type: '[west, south, east, north]',
          defaultValue: 'required',
          description: 'Geographic rectangle in degrees where the PDE solver runs.',
        },
        {
          property: 'primaryColor / secondaryColor',
          type: 'Color | string',
          defaultValue: "'#00d4ff' / '#ff6b35'",
          description:
            'Primary and secondary colors for the automatic counter-orbiting vortex jets.',
        },
        {
          property: 'curl',
          type: 'number',
          defaultValue: '32',
          description: 'Vorticity confinement strength controlling small-scale swirling curls.',
        },
        {
          property: 'velocityDissipation / dyeDissipation',
          type: 'number',
          defaultValue: '0.25 / 0.85',
          description: 'Viscous velocity decay and dye concentration fade rates.',
        },
        {
          property: 'splatRadius / speed / opacity',
          type: 'number',
          defaultValue: '0.0045 / 1 / 0.92',
          description: 'Normalized splat radius, solver time-step multiplier, and layer opacity.',
        },
        {
          property: 'autoEmit / resolution / height',
          type: 'boolean / number',
          defaultValue: 'true / 160 / 2500',
          description:
            'Toggle automatic vortex emitters, grid resolution, and layer altitude in metres.',
        },
        {
          property: 'splat / clear / show / hide / update / destroy',
          type: 'FluidSimulationHandle',
          defaultValue: '—',
          description:
            'Inject live velocity/dye splats at any [lng, lat], clear buffers, and manage EffectHandle lifecycle.',
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
          isZh
            ? 'Fluid Simulation Navier-Stokes 流体仿真演示场景'
            : 'Fluid Simulation 3D CesiumJS demo scene'
        }
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={stirMode ? (isZh ? '退出搅动' : 'Orbit') : isZh ? '搅动流体' : 'Stir'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={Hand} />}
              onClick={() => setStirMode((prev) => !prev)}
              style={stirMode ? { backgroundColor: 'rgba(255, 255, 255, 0.14)' } : undefined}
            />
            <Button
              label={isZh ? '清空' : 'Clear'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={Trash2} />}
              onClick={() => fluidRef.current?.clear()}
            />
            <Button
              label={paused ? (isZh ? '播放' : 'Play') : isZh ? '暂停' : 'Pause'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={paused ? Play : Pause} />}
              onClick={() => setPaused((prev) => !prev)}
            />
            <Button
              label={visible ? (isZh ? '隐藏' : 'Hide') : isZh ? '显示' : 'Show'}
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
