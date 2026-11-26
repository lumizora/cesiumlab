import { useNavigate } from 'react-router';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Code } from '@astryxdesign/core/Code';
import {
  ArrowRight,
  CloudRain,
  Cpu,
  Flame,
  Globe,
  Layers,
  MapPin,
  Mountain,
  Package,
  Radar,
  Radio,
  Route,
  ScatterChart,
  Shield,
  Sparkles,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import { MODULE_CATALOG } from '../data/catalog';
import { useDocsPageMarkdown } from '../lib/docsPage';
import { useI18n } from '../lib/i18n';

const INTRO_MARKDOWN_EN = `# Introduction

Cesiumlab is a modular collection of framework-agnostic packages (@cesiumlab/*) built for CesiumJS.

## Core Principles
- Modular & on-demand: install only the @cesiumlab/* packages your application needs.
- Pure GPU GLSL primitives: zero per-frame CPU geometry rebuilds.
- Explicit lifecycle & cleanup: every module implements EffectHandle with show, hide, update, setPaused, restart, and idempotent destroy().`;

const INTRO_MARKDOWN_ZH = `# 介绍

Cesiumlab 是一套面向 CesiumJS 的模块化开源扩展库集合（@cesiumlab/*），提供按需引入的三维地理空间能力。

## 核心设计原则
- 模块化按需引入：以独立的 @cesiumlab/* npm 包分发，项目只需安装实际使用的能力模块。
- 纯 GPU GLSL 驱动：静态构建 Primitive + 自定义片元着色器，0 每帧 CPU 顶点重建。
- 统一 EffectHandle 生命周期：支持 show / hide / update / setPaused / restart 与幂等 destroy()。`;

const MODULE_ICONS = {
  'comet-arc': Sparkles,
  'pulse-ring': Radio,
  'energy-beam': Zap,
  'energy-wall': Shield,
  'radar-scan': Radar,
  'holo-dome': Globe,
  'flow-path': Route,
  'holo-beacon': MapPin,
  'water-surface': Waves,
  'weather-overlay': CloudRain,
  heatmap: Flame,
  'wind-field': Wind,
  'pulse-scatter': ScatterChart,
  'terrain-analysis': Mountain,
} as const;

export function IntroductionPage() {
  const { isZh } = useI18n();
  const navigate = useNavigate();
  useDocsPageMarkdown(isZh ? INTRO_MARKDOWN_ZH : INTRO_MARKDOWN_EN);

  const principles = isZh
    ? [
        {
          icon: Package,
          title: '模块化按需安装',
          desc: '按领域拆分为独立 @cesiumlab/* 包，共享 @cesiumlab/cesium peer 依赖，避免引入无关代码。',
        },
        {
          icon: Cpu,
          title: '纯 GPU 着色器驱动',
          desc: '以静态 Primitive 与自定义 GLSL 实现动画，0 每帧 CPU 顶点重建，拉近放大依然清晰。',
        },
        {
          icon: Layers,
          title: '统一 EffectHandle 契约',
          desc: '全库共享 show / hide / update / setPaused / destroy 方法，支持多态批量管理与幂等清理。',
        },
      ]
    : [
        {
          icon: Package,
          title: 'Modular & On-Demand',
          desc: 'Published as focused @cesiumlab/* packages sharing @cesiumlab/cesium as a peer dependency.',
        },
        {
          icon: Cpu,
          title: 'Pure GPU GLSL Shaders',
          desc: 'Static Primitives with custom fragment shaders — zero per-frame CPU vertex rebuilds.',
        },
        {
          icon: Layers,
          title: 'Unified EffectHandle API',
          desc: 'Consistent show, hide, update, setPaused, restart, and idempotent destroy across all effects.',
        },
      ];

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <Heading level={1} textWrap="balance">
          {isZh ? '介绍' : 'Introduction'}
        </Heading>
        <Text type="body" color="secondary">
          {isZh ? (
            <>
              Cesiumlab 是一套面向 CesiumJS 的模块化开源扩展库集合（<Code>@cesiumlab/*</Code>
              ）。直接传入你自己的 <Code>Viewer</Code>{' '}
              实例即可按需组合三维地理空间能力，并在离开场景时干净释放资源。
            </>
          ) : (
            <>
              Cesiumlab is a modular collection of framework-agnostic packages (
              <Code>@cesiumlab/*</Code>) for CesiumJS. Pass your own <Code>Viewer</Code> instance,
              compose only the modules you need, and release resources cleanly when leaving a scene.
            </>
          )}
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '核心设计原则' : 'Core Principles'}</Heading>
        <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
          {principles.map((item) => (
            <Card key={item.title} padding={4} width="100%">
              <VStack gap={2}>
                <HStack gap={2} vAlign="center">
                  <Icon icon={item.icon} size="sm" />
                  <Text type="body" weight="semibold">
                    {item.title}
                  </Text>
                </HStack>
                <Text type="body" color="secondary">
                  {item.desc}
                </Text>
              </VStack>
            </Card>
          ))}
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '当前已提供模块' : 'Available Modules'}</Heading>
        <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
          {MODULE_CATALOG.map((item) => {
            const ItemIcon = MODULE_ICONS[item.id as keyof typeof MODULE_ICONS] ?? Sparkles;
            return (
              <Card key={item.id} padding={4} width="100%">
                <VStack gap={4} height="100%" vAlign="between">
                  <VStack gap={2}>
                    <HStack hAlign="between" vAlign="center" gap={2}>
                      <HStack gap={1.5} vAlign="center">
                        <Icon icon={ItemIcon} size="sm" />
                        <Text type="body" weight="semibold">
                          {isZh ? item.titleZh : item.titleEn}
                        </Text>
                      </HStack>
                      <Code color="secondary">{item.tag}</Code>
                    </HStack>
                    <Text type="body" color="secondary">
                      {isZh ? item.summaryZh : item.summaryEn}
                    </Text>
                  </VStack>
                  <HStack hAlign="start">
                    <Button
                      label={isZh ? '查看演示' : 'Open demo'}
                      variant="secondary"
                      size="sm"
                      endContent={<Icon icon={ArrowRight} />}
                      onClick={() => void navigate(item.path)}
                    />
                  </HStack>
                </VStack>
              </Card>
            );
          })}
        </Grid>
      </VStack>
    </VStack>
  );
}

const INSTALL_CMD = `# pnpm
pnpm add @cesiumlab/effects @cesiumlab/cesium

# npm
npm install @cesiumlab/effects @cesiumlab/cesium

# yarn
yarn add @cesiumlab/effects @cesiumlab/cesium`;

const QUICK_START_CODE = `import { Viewer } from '@cesiumlab/cesium';
import { createCometArc } from '@cesiumlab/effects';

const viewer = new Viewer('cesium-container');

const arc = createCometArc(viewer, {
  from: [104.07, 30.57],   // Chengdu
  to: [121.47, 31.23],     // Shanghai
  color: '#ffa31a',
  speed: 1,
  trailLength: 0.24,
});

// Toggle visibility or clean up when unmounting
arc.hide();
arc.show();
arc.destroy();`;

const INSTALL_MARKDOWN_EN = `# Installation

## Requirements
- @cesiumlab/cesium ~1.147.0 (peer dependency, Cesiumlab's customized CesiumJS build)
- Modern ESM bundler or runtime

## Install
\`\`\`bash
${INSTALL_CMD}
\`\`\`

## Quick Start
\`\`\`ts
${QUICK_START_CODE}
\`\`\``;

const INSTALL_MARKDOWN_ZH = `# 安装

## 环境要求
- @cesiumlab/cesium ~1.147.0（peer 依赖，基于 CesiumJS 定制增强的引擎发行版）
- 现代 ESM 构建工具或运行环境

## 安装依赖
\`\`\`bash
${INSTALL_CMD}
\`\`\`

## 快速开始
\`\`\`ts
${QUICK_START_CODE}
\`\`\``;

export function InstallationPage() {
  const { isZh } = useI18n();
  useDocsPageMarkdown(isZh ? INSTALL_MARKDOWN_ZH : INSTALL_MARKDOWN_EN);

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <Heading level={1} textWrap="balance">
          {isZh ? '安装' : 'Installation'}
        </Heading>
        <Text type="body" color="secondary">
          {isZh ? (
            <>
              Cesiumlab 以独立的 <Code>@cesiumlab/*</Code> 包发布，所有包均以{' '}
              <Code>@cesiumlab/cesium</Code>（<Code>~1.147.0</Code>，基于 CesiumJS
              定制增强的引擎包，支持 <Code>/core</Code>、<Code>/engine</Code>、<Code>/widgets</Code>
              、<Code>/gltf</Code> 子路径导出）作为 peer 依赖。按需安装对应包即可，以下以{' '}
              <Code>@cesiumlab/effects</Code> 为例。
            </>
          ) : (
            <>
              Cesiumlab is distributed as scoped <Code>@cesiumlab/*</Code> packages sharing{' '}
              <Code>@cesiumlab/cesium</Code> (<Code>~1.147.0</Code>, our customized CesiumJS engine
              distribution with <Code>/core</Code>, <Code>/engine</Code>, <Code>/widgets</Code>, and{' '}
              <Code>/gltf</Code> subpath exports) as a peer dependency. Install only the packages
              you need — using <Code>@cesiumlab/effects</Code> as an example below.
            </>
          )}
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '安装依赖' : 'Install'}</Heading>
        <CodeBlock code={INSTALL_CMD} language="bash" width="100%" />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '快速开始' : 'Quick Start'}</Heading>
        <Text type="body" color="secondary">
          {isZh ? (
            <>
              将你的 CesiumJS <Code>Viewer</Code>{' '}
              实例传入模块创建函数即可，所有特效自带独立动画时钟，不依赖开启{' '}
              <Code>viewer.clock.shouldAnimate</Code>。
            </>
          ) : (
            <>
              Pass your CesiumJS <Code>Viewer</Code> instance to a module creator. Each effect runs
              on its own independent animation clock without requiring{' '}
              <Code>viewer.clock.shouldAnimate</Code>.
            </>
          )}
        </Text>
        <CodeBlock code={QUICK_START_CODE} language="ts" width="100%" />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '资源所有权与清理' : 'Cleanup & Ownership'}</Heading>
        <Card padding={4} width="100%">
          <Text type="body" color="secondary">
            {isZh ? (
              <>
                CesiumJS <Code>Viewer</Code> 始终由调用方管理。调用 <Code>destroy()</Code>{' '}
                仅会移除该模块自身创建的 Primitive 与渲染监听，且支持重复安全调用。
              </>
            ) : (
              <>
                Your application owns the CesiumJS <Code>Viewer</Code> instance. Calling{' '}
                <Code>destroy()</Code> only removes the Primitives and listeners created by that
                module and is safe to call more than once.
              </>
            )}
          </Text>
        </Card>
      </VStack>
    </VStack>
  );
}
