import { useState, useEffect } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Slider } from '@astryxdesign/core/Slider';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Play, Pause, Box } from 'lucide-react';
import { themes, defaultThemeSlug } from '../astryx-themes';

interface EarthShowcaseBoardProps {
  onNavigateDocs: (docName?: string) => void;
}

type WeatherMode = 'rain' | 'snow' | 'fog';

const FEATURED_COMPONENTS = [
  { label: 'Measurement 3D', doc: 'Volumetric Clouds' },
  { label: 'Weather Effects', doc: 'Weather System' },
  { label: 'Terrain Clip', doc: 'Atmospheric Scattering' },
  { label: 'Camera Path', doc: 'Ocean Water' },
  { label: 'Timeline Pro', doc: 'Sci-Fi Scanline' },
  { label: 'Dynamic Path', doc: 'Bloom' },
];

export function EarthShowcaseBoard({ onNavigateDocs }: EarthShowcaseBoardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineProgress, setTimelineProgress] = useState(45);
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('rain');
  const [weatherIntensity, setWeatherIntensity] = useState(70);
  const [layers, setLayers] = useState({
    floodLayer: true,
    buildingTiles: false,
    trafficHeatmap: false,
  });

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setTimelineProgress((prev) => (prev >= 100 ? 0 : prev + 1));
    }, 150);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const formatMinutes = (progress: number) => {
    const totalMinutes = Math.round((progress / 100) * 12 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const arcOpacity = layers.floodLayer ? 0.85 : 0.3;
  const secondaryArcColor = layers.trafficHeatmap ? '#fb923c' : '#c084fc';
  const weatherTintOpacity = weatherMode === 'fog' ? (weatherIntensity / 100) * 0.35 : 0;

  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <Card width="100%" padding={5} elevation="high">
        <Grid columns={{ minWidth: 250, max: 3 }} gap={5} align="center">
          {/* 左侧悬浮面板列 */}
          <VStack gap={4}>
            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <VStack gap={0.5}>
                  <Text type="label" color="secondary">
                    Components
                  </Text>
                  <Heading level={2} type="display-2">
                    42
                  </Heading>
                  <Text type="supporting" size="xsm" hasTabularNumbers>
                    AND COUNTING
                  </Text>
                </VStack>
                <VStack gap={1} hAlign="start">
                  {FEATURED_COMPONENTS.map((item) => (
                    <Button
                      key={item.label}
                      label={item.label}
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigateDocs(item.doc)}
                    />
                  ))}
                </VStack>
              </VStack>
            </Card>

            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <Text type="label" color="secondary">
                  Install
                </Text>
                <CodeBlock
                  code="npm i @cesium-ui/core"
                  language="bash"
                  hasLanguageLabel={false}
                  size="sm"
                  width="100%"
                />
              </VStack>
            </Card>
          </VStack>

          {/* 中央 3D 地球可视化画布（自定义领域 SVG 封装） */}
          <VStack gap={4} hAlign="center">
            <svg
              viewBox="0 0 360 360"
              width="100%"
              role="img"
              aria-label="Interactive 3D Earth geospatial visualization"
            >
              <defs>
                <radialGradient id="earth-halo" cx="50%" cy="50%" r="50%">
                  <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.32" />
                  <stop offset="85%" stopColor="#1e3a8a" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="earth-body" cx="38%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="48%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>
                <radialGradient id="earth-rim" cx="50%" cy="50%" r="50%">
                  <stop offset="78%" stopColor="#3b82f6" stopOpacity="0" />
                  <stop offset="96%" stopColor="#60a5fa" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.7" />
                </radialGradient>
                <clipPath id="earth-clip">
                  <circle cx="180" cy="180" r="132" />
                </clipPath>
              </defs>

              {/* 外大气层光晕 */}
              <circle cx="180" cy="180" r="174" fill="url(#earth-halo)" />

              {/* 球体底色 */}
              <circle
                cx="180"
                cy="180"
                r="132"
                fill="url(#earth-body)"
                stroke="#3b82f6"
                strokeOpacity="0.3"
                strokeWidth="1"
              />

              {/* 旋转经纬网格 */}
              <g clipPath="url(#earth-clip)" opacity="0.55">
                <g>
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 180 180"
                    to="360 180 180"
                    dur="90s"
                    repeatCount="indefinite"
                  />
                  <ellipse
                    cx="180"
                    cy="180"
                    rx="132"
                    ry="44"
                    fill="none"
                    stroke="#3b82f6"
                    strokeOpacity="0.28"
                    strokeWidth="1"
                  />
                  <ellipse
                    cx="180"
                    cy="180"
                    rx="132"
                    ry="88"
                    fill="none"
                    stroke="#3b82f6"
                    strokeOpacity="0.22"
                    strokeWidth="1"
                  />
                  <ellipse
                    cx="180"
                    cy="180"
                    rx="44"
                    ry="132"
                    fill="none"
                    stroke="#3b82f6"
                    strokeOpacity="0.28"
                    strokeWidth="1"
                  />
                  <ellipse
                    cx="180"
                    cy="180"
                    rx="92"
                    ry="132"
                    fill="none"
                    stroke="#3b82f6"
                    strokeOpacity="0.22"
                    strokeWidth="1"
                  />
                  <line
                    x1="48"
                    y1="180"
                    x2="312"
                    y2="180"
                    stroke="#3b82f6"
                    strokeOpacity="0.25"
                    strokeWidth="1"
                  />
                  <line
                    x1="180"
                    y1="48"
                    x2="180"
                    y2="312"
                    stroke="#3b82f6"
                    strokeOpacity="0.25"
                    strokeWidth="1"
                  />
                </g>

                {/* 3D Tiles 建筑格网示意 */}
                {layers.buildingTiles && (
                  <g stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.2" fill="none">
                    <rect x="132" y="142" width="18" height="24" rx="2" />
                    <rect x="156" y="128" width="22" height="38" rx="2" />
                    <rect x="184" y="148" width="16" height="20" rx="2" />
                    <rect x="206" y="136" width="20" height="32" rx="2" />
                  </g>
                )}

                {/* 雾气层叠加 */}
                {weatherTintOpacity > 0 && (
                  <circle cx="180" cy="180" r="132" fill="#cbd5e1" opacity={weatherTintOpacity} />
                )}
              </g>

              {/* 地理空间连线弧线 */}
              <g clipPath="url(#earth-clip)" opacity={arcOpacity}>
                <path
                  d="M 86 184 Q 180 68 272 152"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <path
                  d="M 114 236 Q 204 282 248 122"
                  fill="none"
                  stroke={secondaryArcColor}
                  strokeWidth="1.5"
                />
                <path
                  d="M 74 146 Q 158 262 284 208"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.4"
                  strokeDasharray="2 5"
                />
                <circle cx="86" cy="184" r="3.5" fill="#60a5fa" />
                <circle cx="272" cy="152" r="3.5" fill="#60a5fa" />
                <circle cx="248" cy="122" r="3.5" fill={secondaryArcColor} />
                <circle cx="284" cy="208" r="3.5" fill="#38bdf8" />
              </g>

              {/* 大气层边缘高光 */}
              <circle cx="180" cy="180" r="132" fill="url(#earth-rim)" />
            </svg>

            <HStack gap={4} vAlign="center" hAlign="between" width="100%">
              <HStack gap={2} vAlign="center">
                <StatusDot variant="accent" label="Cesium Native active" />
                <VStack gap={0}>
                  <Text type="label" hasTabularNumbers>
                    100% Cesium Native
                  </Text>
                  <Text type="supporting" size="xsm">
                    WebGL / WebGPU Ready
                  </Text>
                </VStack>
              </HStack>
              <VStack gap={0} hAlign="end">
                <HStack gap={1} vAlign="center">
                  <Icon icon={Box} size="xsm" color="secondary" />
                  <Text type="code" size="xsm" hasTabularNumbers>
                    3D 20.232718
                  </Text>
                </HStack>
                <Text type="supporting" size="xsm" hasTabularNumbers>
                  103.455, 27.6530
                </Text>
              </VStack>
            </HStack>
          </VStack>

          {/* 右侧悬浮面板列 */}
          <VStack gap={4}>
            {/* Timeline */}
            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <HStack hAlign="between" vAlign="center">
                  <Text type="label">Timeline</Text>
                  <Text type="supporting" size="xsm" hasTabularNumbers>
                    {formatMinutes(timelineProgress)} / 12:00
                  </Text>
                </HStack>
                <HStack gap={3} vAlign="center">
                  <IconButton
                    label={isPlaying ? 'Pause timeline' : 'Play timeline'}
                    tooltip={isPlaying ? 'Pause' : 'Play'}
                    variant="secondary"
                    size="sm"
                    icon={<Icon icon={isPlaying ? Pause : Play} />}
                    onClick={() => setIsPlaying((prev) => !prev)}
                  />
                  <StackItem size="fill">
                    <Slider
                      label="Timeline scrub"
                      isLabelHidden
                      min={0}
                      max={100}
                      value={timelineProgress}
                      valueDisplay="none"
                      onChange={(val: number) => setTimelineProgress(val)}
                    />
                  </StackItem>
                </HStack>
              </VStack>
            </Card>

            {/* Particle Weather */}
            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <Text type="label">Particle Weather</Text>
                <SegmentedControl
                  label="Weather precipitation mode"
                  size="sm"
                  layout="fill"
                  value={weatherMode}
                  onChange={(val) => setWeatherMode(val as WeatherMode)}
                >
                  <SegmentedControlItem value="rain" label="雨" />
                  <SegmentedControlItem value="snow" label="雪" />
                  <SegmentedControlItem value="fog" label="雾" />
                </SegmentedControl>
                <Slider
                  label="Intensity"
                  min={0}
                  max={100}
                  value={weatherIntensity}
                  valueDisplay="text"
                  formatValue={(v) => `${v}%`}
                  onChange={(val: number) => setWeatherIntensity(val)}
                />
              </VStack>
            </Card>

            {/* Layer Manager */}
            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <Text type="label">Layer Manager</Text>
                <CheckboxInput
                  label="Flood Layer"
                  size="sm"
                  value={layers.floodLayer}
                  onChange={(checked) => setLayers((prev) => ({ ...prev, floodLayer: checked }))}
                />
                <CheckboxInput
                  label="Building 3D Tiles"
                  size="sm"
                  value={layers.buildingTiles}
                  onChange={(checked) => setLayers((prev) => ({ ...prev, buildingTiles: checked }))}
                />
                <CheckboxInput
                  label="Traffic Heatmap"
                  size="sm"
                  value={layers.trafficHeatmap}
                  onChange={(checked) =>
                    setLayers((prev) => ({ ...prev, trafficHeatmap: checked }))
                  }
                />
              </VStack>
            </Card>
          </VStack>
        </Grid>
      </Card>
    </Theme>
  );
}
