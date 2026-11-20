import { Fragment } from 'react';
import { useNavigate } from 'react-router';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Code } from '@astryxdesign/core/Code';
import { Divider } from '@astryxdesign/core/Divider';
import { useClipboard } from '@astryxdesign/core/hooks';
import { ArrowRight } from 'lucide-react';
import { EFFECT_DEMOS } from '../lib/effectDemos';
import { useI18n } from '../lib/i18n';

const INTRO_MARKDOWN_EN = `# Introduction

Cesiumlab is a modular collection of framework-agnostic packages (@cesiumlab/*) built for CesiumJS.

## Core Principles
- Modular & on-demand: install only the @cesiumlab/* packages your application needs.
- Framework-agnostic: works with vanilla TypeScript/JavaScript, React, Vue, or any frontend stack by attaching directly to your existing CesiumJS Viewer.
- Explicit lifecycle & cleanup: each module manages only the resources it creates and exposes an idempotent destroy() handle.
- Tree-shakable ESM + TypeScript: distributed as clean ES modules with bundled type declarations.`;

const INTRO_MARKDOWN_ZH = `# 介绍

Cesiumlab 是一套面向 CesiumJS 的模块化开源扩展库集合（@cesiumlab/*），提供按需引入的三维地理空间能力。

## 核心设计原则
- 模块化按需引入：以独立的 @cesiumlab/* npm 包分发，项目只需安装实际使用的能力模块。
- 框架无关：兼容原生 TypeScript/JavaScript、React、Vue 等任意前端技术栈，直接传入现有的 CesiumJS Viewer 实例即可集成。
- 清晰的生命周期与清理：每个模块仅管理自身创建的资源，并提供支持幂等调用的 destroy() 释放方法。
- 原生 ESM 与完整类型：输出可 Tree-shaking 的标准 ES Module 与 TypeScript 类型声明。`;

export function IntroductionPage() {
  const { isZh } = useI18n();
  const navigate = useNavigate();
  const { isCopied, copy } = useClipboard();

  return (
    <VStack gap={8} paddingBlockEnd={8}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
          <Heading level={1} textWrap="balance">
            {isZh ? '介绍' : 'Introduction'}
          </Heading>
          <Button
            label={isCopied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制页面' : 'Copy page'}
            variant="secondary"
            size="sm"
            icon={isCopied ? <Icon icon="check" /> : undefined}
            onClick={() => void copy(isZh ? INTRO_MARKDOWN_ZH : INTRO_MARKDOWN_EN)}
          />
        </HStack>
        <Text type="body" color="secondary">
          {isZh ? (
            <>
              Cesiumlab 是一套面向 CesiumJS 的模块化开源扩展库集合（<Code>@cesiumlab/*</Code>
              ）。直接传入你自己的 <Code>Viewer</Code> 实例即可按需组合各类三维地理空间能力，并在离开场景时干净释放资源。
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
        <Card padding={0} width="100%">
          <VStack gap={0}>
            <VStack gap={1} padding={4}>
              <Text type="body" weight="semibold">
                {isZh ? '模块化按需安装' : 'Modular packages, install on demand'}
              </Text>
              <Text type="body" color="secondary">
                {isZh ? (
                  <>
                    不同领域的能力按独立 npm 包发布（如 <Code>@cesiumlab/effects</Code>
                    ），彼此解耦、共享 <Code>cesium</Code> peer 依赖，避免引入无关代码。
                  </>
                ) : (
                  <>
                    Capabilities are published as focused npm packages (such as{' '}
                    <Code>@cesiumlab/effects</Code>) that share <Code>cesium</Code> as a peer
                    dependency, keeping your bundle lean.
                  </>
                )}
              </Text>
            </VStack>
            <Divider />
            <VStack gap={1} padding={4}>
              <Text type="body" weight="semibold">
                {isZh ? '框架无关的 CesiumJS API' : 'Framework-agnostic CesiumJS API'}
              </Text>
              <Text type="body" color="secondary">
                {isZh ? (
                  <>
                    支持原生 TypeScript、React、Vue 或任意前端框架。所有能力直接挂载到调用方持有的
                    Cesium <Code>Viewer</Code>，并自动跟随 <Code>viewer.clock</Code> 同步驱动。
                  </>
                ) : (
                  <>
                    Works with vanilla TypeScript, React, Vue, or any web framework. Modules attach
                    directly to your caller-owned Cesium <Code>Viewer</Code> and synchronize with{' '}
                    <Code>viewer.clock</Code>.
                  </>
                )}
              </Text>
            </VStack>
            <Divider />
            <VStack gap={1} padding={4}>
              <Text type="body" weight="semibold">
                {isZh ? '可控的生命周期与资源清理' : 'Predictable lifecycle & cleanup'}
              </Text>
              <Text type="body" color="secondary">
                {isZh ? (
                  <>
                    每个模块都会返回包含幂等 <Code>destroy()</Code> 方法的句柄，仅移除自身创建的
                    Cesium Entity 或后处理资源，不会影响场景中的其他内容。
                  </>
                ) : (
                  <>
                    Every module returns a handle with an idempotent <Code>destroy()</Code> method
                    that removes only the Cesium entities or resources it created, without touching
                    the rest of your scene.
                  </>
                )}
              </Text>
            </VStack>
          </VStack>
        </Card>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '当前已提供模块' : 'Available Modules'}</Heading>
        <Card padding={0} width="100%">
          <VStack gap={0}>
            {EFFECT_DEMOS.map((demo, idx) => (
              <Fragment key={demo.meta.id}>
                {idx > 0 && <Divider />}
                <HStack padding={4} gap={4} hAlign="between" vAlign="center" wrap="wrap">
                  <StackItem size="fill">
                    <VStack gap={1}>
                      <Text type="body" weight="semibold">
                        {demo.meta.title}
                      </Text>
                      <Text type="body" color="secondary">
                        {demo.meta.description}
                      </Text>
                    </VStack>
                  </StackItem>
                  <Button
                    label={isZh ? '查看演示' : 'Open demo'}
                    variant="secondary"
                    size="sm"
                    endContent={<Icon icon={ArrowRight} />}
                    onClick={() => void navigate(`/docs/${demo.meta.id}`)}
                  />
                </HStack>
              </Fragment>
            ))}
          </VStack>
        </Card>
      </VStack>

      <HStack gap={3}>
        <Button
          label={isZh ? '安装指南' : 'Installation'}
          variant="primary"
          size="sm"
          endContent={<Icon icon={ArrowRight} />}
          onClick={() => void navigate('/docs/installation')}
        />
      </HStack>
    </VStack>
  );
}

const INSTALL_CMD = `# pnpm
pnpm add @cesiumlab/effects cesium

# npm
npm install @cesiumlab/effects cesium

# yarn
yarn add @cesiumlab/effects cesium`;

const QUICK_START_CODE = `import { Color, Viewer } from 'cesium';
import { createFlowingArc } from '@cesiumlab/effects';

const viewer = new Viewer('cesium-container');

const arc = createFlowingArc(viewer, {
  from: [103.82, 1.35],   // Singapore
  to: [139.69, 35.68],    // Tokyo
  height: 430_000,
  duration: 4,
  color: Color.DEEPSKYBLUE,
});

// Remove the module when unmounting or switching scenes
arc.destroy();`;

const INSTALL_MARKDOWN_EN = `# Installation

## Requirements
- cesium ~1.147.0 (peer dependency)
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
- cesium ~1.147.0（peer 依赖）
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
  const { isCopied, copy } = useClipboard();

  return (
    <VStack gap={8} paddingBlockEnd={8}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
          <Heading level={1} textWrap="balance">
            {isZh ? '安装' : 'Installation'}
          </Heading>
          <Button
            label={isCopied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制页面' : 'Copy page'}
            variant="secondary"
            size="sm"
            icon={isCopied ? <Icon icon="check" /> : undefined}
            onClick={() => void copy(isZh ? INSTALL_MARKDOWN_ZH : INSTALL_MARKDOWN_EN)}
          />
        </HStack>
        <Text type="body" color="secondary">
          {isZh ? (
            <>
              Cesiumlab 以独立的 <Code>@cesiumlab/*</Code> 包发布，所有包均以 <Code>cesium</Code>（
              <Code>~1.147.0</Code>）作为 peer 依赖。按需安装对应包即可，以下以{' '}
              <Code>@cesiumlab/effects</Code> 为例。
            </>
          ) : (
            <>
              Cesiumlab is distributed as scoped <Code>@cesiumlab/*</Code> packages sharing{' '}
              <Code>cesium</Code> (<Code>~1.147.0</Code>) as a peer dependency. Install only the
              packages you need — using <Code>@cesiumlab/effects</Code> as an example below.
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
              将你的 CesiumJS <Code>Viewer</Code> 实例传入模块创建函数即可，动画会自动跟随{' '}
              <Code>viewer.clock</Code>。
            </>
          ) : (
            <>
              Pass your CesiumJS <Code>Viewer</Code> instance to a module creator. Animations follow{' '}
              <Code>viewer.clock</Code> automatically.
            </>
          )}
        </Text>
        <CodeBlock code={QUICK_START_CODE} language="ts" width="100%" />
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{isZh ? '资源所有权与清理' : 'Cleanup & Ownership'}</Heading>
        <Card padding={4} width="100%">
          <VStack gap={2}>
            <Text type="body" color="secondary">
              {isZh ? (
                <>
                  CesiumJS <Code>Viewer</Code> 始终由调用方管理。调用 <Code>destroy()</Code>{' '}
                  仅会移除该模块自身创建的 Entity 或后处理阶段，且支持重复安全调用。
                </>
              ) : (
                <>
                  Your application owns the CesiumJS <Code>Viewer</Code> instance. Calling{' '}
                  <Code>destroy()</Code> only removes the entities or post-process stages created by
                  that module and is safe to call more than once.
                </>
              )}
            </Text>
          </VStack>
        </Card>
      </VStack>
    </VStack>
  );
}
