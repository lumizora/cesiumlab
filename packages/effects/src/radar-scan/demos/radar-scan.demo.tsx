import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, type Viewer } from 'cesium';
import {
  Button,
  Card,
  Code,
  CodeBlock,
  Divider,
  Grid,
  HStack,
  Heading,
  Icon,
  Slider,
  StackItem,
  Text,
  VStack,
} from '@astryxdesign/core';
import { Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createRadarScan, type RadarScanHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'radar-scan',
  title: 'Radar Scan',
  section: 'Visual Effects',
  description:
    'GPU-driven rotating radar sweep sector on a single ENU disc Primitive with a sharp leading beam, fading afterglow, and concentric range rings.',
  isNew: true,
  order: 5,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createRadarScan } from '@cesiumlab/effects';

const radar = createRadarScan(viewer, {
  position: [121.47, 31.23],  // Shanghai
  color: '#00e5a0',
  radius: 180_000,
  speed: 1.2,
  sectorAngle: Math.PI * 0.45,
  clockwise: true,
});

// O(1) GPU uniform & matrix updates
radar.update({ radius: 260_000, speed: 1.8 });
radar.hide();
radar.show();
radar.destroy();`;

const CENTER_COORD: readonly [number, number] = [121.4737, 31.2304];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 0),
    new HeadingPitchRange(CesiumMath.toRadians(350), CesiumMath.toRadians(-56), 950_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

export default function RadarScanDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const radarRef = useRef<RadarScanHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [radiusKm, setRadiusKm] = useState(180);
  const [speed, setSpeed] = useState(1.2);
  const [sectorDeg, setSectorDeg] = useState(80);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      radarRef.current = createRadarScan(viewer, {
        position: CENTER_COORD,
        radius: radiusKm * 1_000,
        speed,
        sectorAngle: CesiumMath.toRadians(sectorDeg),
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        radarRef.current?.destroy();
        radarRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    radarRef.current?.update({
      radius: radiusKm * 1_000,
      speed,
      sectorAngle: CesiumMath.toRadians(sectorDeg),
    });
  }, [radiusKm, speed, sectorDeg]);

  useEffect(() => {
    radarRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    radarRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '雷达扫描扇面 (Radar Scan)' : meta.title;
  const pageDescription = isZh
    ? '单张 ENU 切平面 Primitive + 极坐标 GLSL 雷达着色器：具备锐利发光扫描前沿、指数衰减扇形余辉与同心刻度环，底图影像保持清晰通透。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '雷达中心经纬度（单位：度）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5a0'",
          description: '雷达扫描光束与刻度环颜色。',
        },
        {
          property: 'radius / height',
          type: 'number',
          defaultValue: '180000 / 2000',
          description: '扫描半径与离地高度偏移（单位：米）。',
        },
        {
          property: 'speed / clockwise',
          type: 'number / boolean',
          defaultValue: '1.2 / true',
          description: '旋转角速度（弧度/秒）与是否顺时针扫描。',
        },
        {
          property: 'sectorAngle / opacity',
          type: 'number',
          defaultValue: '0.45π / 0.9',
          description: '余辉扇区张角（弧度）与整体透明度系数。',
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
          description: 'Radar center [longitude, latitude] in degrees.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5a0'",
          description: 'Radar sweep and range ring color (Cesium Color or CSS string).',
        },
        {
          property: 'radius / height',
          type: 'number',
          defaultValue: '180000 / 2000',
          description: 'Outer scan radius and altitude offset above ground in metres.',
        },
        {
          property: 'speed / clockwise',
          type: 'number / boolean',
          defaultValue: '1.2 / true',
          description: 'Angular rotation speed (rad/s) and clockwise direction toggle.',
        },
        {
          property: 'sectorAngle / opacity',
          type: 'number',
          defaultValue: '0.45π / 0.9',
          description: 'Trailing afterglow sector angle in radians and opacity multiplier.',
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
        label={isZh ? 'Radar Scan 雷达扫描演示场景' : 'Radar Scan 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        toolbar={
          <>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label={paused ? (isZh ? '播放' : 'Play') : isZh ? '暂停' : 'Pause'}
                variant="secondary"
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
            </HStack>

            <Grid columns={{ minWidth: 160, max: 3 }} gap={4} width="100%">
              <Slider
                label={isZh ? `半径 · ${radiusKm}km` : `Radius · ${radiusKm}km`}
                value={radiusKm}
                min={60}
                max={400}
                step={20}
                onChange={setRadiusKm}
              />
              <Slider
                label={isZh ? `转速 · ${speed.toFixed(1)}` : `Speed · ${speed.toFixed(1)}`}
                value={speed}
                min={0.2}
                max={3.5}
                step={0.1}
                onChange={setSpeed}
              />
              <Slider
                label={isZh ? `扇角 · ${sectorDeg}°` : `Sector · ${sectorDeg}°`}
                value={sectorDeg}
                min={25}
                max={180}
                step={5}
                onChange={setSectorDeg}
              />
            </Grid>
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
