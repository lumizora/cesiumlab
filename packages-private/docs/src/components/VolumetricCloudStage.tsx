import { useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Popover } from '@astryxdesign/core/Popover';
import { Slider } from '@astryxdesign/core/Slider';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Settings2 } from 'lucide-react';
import { themes, defaultThemeSlug } from '../astryx-themes';

interface VolumetricCloudStageProps {
  title: string;
}

export function VolumetricCloudStage({ title }: VolumetricCloudStageProps) {
  const [showControls, setShowControls] = useState(false);
  const [density, setDensity] = useState(1.45);
  const [raySteps, setRaySteps] = useState(64);
  const [castShadows, setCastShadows] = useState(true);

  const cloudOpacity = Math.min(0.95, Math.max(0.2, density / 2.2));
  const glowOpacity = castShadows ? 0.65 : 0.25;

  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <Card width="100%" padding={0} elevation="med">
        <VStack gap={0} style={{ position: 'relative' }}>
          {/* 16:10 WebGL 体积云模拟画布 */}
          <svg
            viewBox="0 0 800 500"
            width="100%"
            style={{ display: 'block' }}
            role="img"
            aria-label={`${title} real-time WebGL preview stage`}
          >
            <defs>
              <linearGradient id="stage-bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#050507" />
                <stop offset="100%" stopColor="#070d1c" />
              </linearGradient>
              <radialGradient id="planet-horizon" cx="50%" cy="100%" r="85%">
                <stop offset="0%" stopColor="#002244" />
                <stop offset="45%" stopColor="#001133" />
                <stop offset="100%" stopColor="#020308" />
              </radialGradient>
              <radialGradient id="atmo-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={glowOpacity} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
              <filter id="cloud-blur-lg" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="28" />
              </filter>
              <filter id="cloud-blur-md" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="20" />
              </filter>
              <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
                <line
                  x1="0"
                  y1="2"
                  x2="4"
                  y2="2"
                  stroke="#ffffff"
                  strokeOpacity="0.035"
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            <rect width="800" height="500" fill="url(#stage-bg)" />

            {/* 大气层散射光晕 */}
            <ellipse cx="400" cy="275" rx="380" ry="110" fill="url(#atmo-glow)" />

            {/* 地球曲率弧面 */}
            <circle
              cx="400"
              cy="1080"
              r="760"
              fill="url(#planet-horizon)"
              stroke="#1d4ed8"
              strokeOpacity="0.35"
              strokeWidth="1.5"
            />

            {/* 体积云层（随 Density 参数实时联动） */}
            <g opacity={cloudOpacity}>
              <ellipse
                cx="220"
                cy="185"
                rx="170"
                ry="62"
                fill="#818cf8"
                fillOpacity="0.28"
                filter="url(#cloud-blur-lg)"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0; 18 -14; 0 0"
                  dur="14s"
                  repeatCount="indefinite"
                />
              </ellipse>
              <ellipse
                cx="565"
                cy="220"
                rx="210"
                ry="58"
                fill="#cbd5e1"
                fillOpacity="0.24"
                filter="url(#cloud-blur-lg)"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0; -22 10; 0 0"
                  dur="18s"
                  repeatCount="indefinite"
                />
              </ellipse>
              <ellipse
                cx="410"
                cy="155"
                rx="150"
                ry="68"
                fill="#93c5fd"
                fillOpacity="0.18"
                filter="url(#cloud-blur-md)"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 0; 10 -12; 0 0"
                  dur="11s"
                  repeatCount="indefinite"
                />
              </ellipse>
            </g>

            {/* 扫描线覆盖 */}
            <rect width="800" height="500" fill="url(#scanlines)" />
          </svg>

          {/* 右下角直接悬浮 Controls 按钮与参数 Popover */}
          <HStack style={{ position: 'absolute', right: 16, bottom: 16 }}>
            <Popover
              isOpen={showControls}
              onOpenChange={setShowControls}
              placement="above"
              alignment="end"
              width={280}
              padding={4}
              label="Shader Parameters"
              content={
                <VStack gap={4}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={Settings2} size="sm" color="secondary" />
                    <Heading level={4}>Shader Parameters</Heading>
                  </HStack>
                  <Divider />
                  <Slider
                    label="Density Multiplier"
                    min={0.2}
                    max={3.0}
                    step={0.05}
                    value={density}
                    valueDisplay="text"
                    formatValue={(v) => v.toFixed(2)}
                    onChange={(val: number) => setDensity(val)}
                  />
                  <Slider
                    label="Ray Marching Steps"
                    min={16}
                    max={128}
                    step={8}
                    value={raySteps}
                    valueDisplay="text"
                    formatValue={(v) => `${v}`}
                    onChange={(val: number) => setRaySteps(val)}
                  />
                  <Switch
                    label="Cast Shadows"
                    size="sm"
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                    value={castShadows}
                    onChange={setCastShadows}
                  />
                </VStack>
              }
            >
              <Button
                label="Controls"
                size="sm"
                variant="secondary"
                elevation="med"
                icon={<Icon icon={Settings2} />}
              />
            </Popover>
          </HStack>
        </VStack>
      </Card>
    </Theme>
  );
}
