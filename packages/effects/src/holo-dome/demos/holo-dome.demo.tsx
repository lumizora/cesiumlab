import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, type Viewer } from '@cesiumlab/cesium';
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
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createHoloDome, type HoloDomeHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'holo-dome',
  title: 'Holo Dome',
  section: 'Visual Effects',
  description:
    '3D volumetric holographic dome shield with Fresnel rim glow, procedural hexagonal honeycomb mesh, and a rising latitude scan wave.',
  isNew: true,
  order: 6,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createHoloDome } from '@cesiumlab/effects';

const dome = createHoloDome(viewer, {
  position: [104.07, 30.57],  // Chengdu
  color: '#38bdf8',
  radius: 180_000,
  heightScale: 0.85,
  speed: 1,
  gridScale: 14,
});

// O(1) GPU uniform & matrix updates
dome.update({ radius: 240_000, gridScale: 18 });
dome.hide();
dome.show();
dome.destroy();`;

const CENTER_COORD: readonly [number, number] = [104.0668, 30.5728];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 0),
    new HeadingPitchRange(CesiumMath.toRadians(335), CesiumMath.toRadians(-32), 760_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#38bdf8',
  radiusKm: 180,
  heightScale: 0.85,
  speed: 1,
  opacity: 0.85,
  gridScale: 14,
  groundOffsetKm: 0,
} as const;

export default function HoloDomeDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const domeRef = useRef<HoloDomeHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULTS.radiusKm);
  const [heightScale, setHeightScale] = useState<number>(DEFAULTS.heightScale);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [gridScale, setGridScale] = useState<number>(DEFAULTS.gridScale);
  const [groundOffsetKm, setGroundOffsetKm] = useState<number>(DEFAULTS.groundOffsetKm);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      domeRef.current = createHoloDome(viewer, {
        position: CENTER_COORD,
        color,
        radius: radiusKm * 1_000,
        heightScale,
        speed,
        opacity,
        gridScale,
        groundOffset: groundOffsetKm * 1_000,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        domeRef.current?.destroy();
        domeRef.current = null;
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
    domeRef.current?.destroy();
    domeRef.current = createHoloDome(viewer, {
      position: CENTER_COORD,
      color,
      radius: radiusKm * 1_000,
      heightScale,
      speed,
      opacity,
      gridScale,
      groundOffset: groundOffsetKm * 1_000,
      paused,
      show: visible,
    });
    // Rebuild only when construction-only anchor offset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundOffsetKm]);

  useEffect(() => {
    domeRef.current?.update({
      color,
      radius: radiusKm * 1_000,
      heightScale,
      speed,
      opacity,
      gridScale,
    });
  }, [color, radiusKm, heightScale, speed, opacity, gridScale]);

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    radiusKm !== DEFAULTS.radiusKm ||
    heightScale !== DEFAULTS.heightScale ||
    speed !== DEFAULTS.speed ||
    opacity !== DEFAULTS.opacity ||
    gridScale !== DEFAULTS.gridScale ||
    groundOffsetKm !== DEFAULTS.groundOffsetKm;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setRadiusKm(DEFAULTS.radiusKm);
    setHeightScale(DEFAULTS.heightScale);
    setSpeed(DEFAULTS.speed);
    setOpacity(DEFAULTS.opacity);
    setGridScale(DEFAULTS.gridScale);
    setGroundOffsetKm(DEFAULTS.groundOffsetKm);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '外观' : 'Appearance',
        controls: [
          {
            type: 'color',
            id: 'color',
            label: isZh ? '护盾颜色' : 'Color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.2,
            max: 1.4,
            step: 0.05,
            onChange: setOpacity,
          },
          {
            type: 'slider',
            id: 'gridScale',
            label: isZh ? `蜂巢密度 · ${gridScale}` : `Grid · ${gridScale}`,
            value: gridScale,
            min: 6,
            max: 28,
            step: 2,
            onChange: setGridScale,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '几何' : 'Geometry',
        controls: [
          {
            type: 'slider',
            id: 'radius',
            label: isZh ? `半径 · ${radiusKm}km` : `Radius · ${radiusKm}km`,
            value: radiusKm,
            min: 60,
            max: 360,
            step: 20,
            onChange: setRadiusKm,
          },
          {
            type: 'slider',
            id: 'heightScale',
            label: isZh
              ? `高度比例 · ${heightScale.toFixed(2)}x`
              : `Height scale · ${heightScale.toFixed(2)}x`,
            value: heightScale,
            min: 0.35,
            max: 1.4,
            step: 0.05,
            onChange: setHeightScale,
          },
          {
            type: 'slider',
            id: 'groundOffset',
            label: isZh ? `离地偏移 · ${groundOffsetKm}km` : `Ground offset · ${groundOffsetKm}km`,
            value: groundOffsetKm,
            min: 0,
            max: 60,
            step: 2,
            onChange: setGroundOffsetKm,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动画' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `扫描速度 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
        ],
      },
    ],
    [isZh, color, opacity, gridScale, radiusKm, heightScale, groundOffsetKm, speed],
  );

  useEffect(() => {
    domeRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    domeRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '全息能量穹顶 (Holo Dome)' : meta.title;
  const pageDescription = isZh
    ? '自定义三维半球壳网格 + 菲涅尔边缘高亮 + 纯数学程序化六边形蜂窝网与自下而上的全息扫描波带，中心通透不遮挡底图。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '穹顶中心经纬度（单位：度）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#38bdf8'",
          description: '护盾边缘光晕、蜂窝网格与扫描带颜色。',
        },
        {
          property: 'radius / heightScale',
          type: 'number',
          defaultValue: '180000 / 0.85',
          description: '赤道覆盖半径（米）与竖向高度比例。',
        },
        {
          property: 'speed / gridScale / opacity',
          type: 'number',
          defaultValue: '1 / 14 / 0.85',
          description: '扫描波上升速度、程序化六边形网格密度与整体透明度。',
        },
        {
          property: 'groundOffset',
          type: 'number',
          defaultValue: '0',
          description: '底部相对地表高程的偏移量（单位：米）。',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: '初始是否可见、初始是否暂停动画。',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description: '统一特效句柄方法：显隐切换、O(1) 更新矩阵与 uniform、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: 'Dome center [longitude, latitude] in degrees.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#38bdf8'",
          description: 'Shield rim, honeycomb mesh, and scan band color.',
        },
        {
          property: 'radius / heightScale',
          type: 'number',
          defaultValue: '180000 / 0.85',
          description: 'Equatorial radius in metres and vertical height scale factor.',
        },
        {
          property: 'speed / gridScale / opacity',
          type: 'number',
          defaultValue: '1 / 14 / 0.85',
          description: 'Scan wave speed, procedural hex grid density, and opacity multiplier.',
        },
        {
          property: 'groundOffset',
          type: 'number',
          defaultValue: '0',
          description: 'Vertical offset above sampled ground elevation in metres.',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: 'Initial visibility and paused state.',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description:
            'Unified handle methods for visibility, O(1) GPU updates, pause/restart, and cleanup.',
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
        label={isZh ? 'Holo Dome 全息能量穹顶演示场景' : 'Holo Dome 3D CesiumJS demo scene'}
        shouldAnimate={false}
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

        <HStack paddingInline={4} paddingBlock={2} gap={4} vAlign="center">
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
