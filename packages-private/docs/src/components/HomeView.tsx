import { useNavigate } from 'react-router';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { Section } from '@astryxdesign/core/Section';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Kbd } from '@astryxdesign/core/Kbd';
import { ArrowRight, Github, Moon, Sun } from 'lucide-react';
import { CesiumLogo } from './CesiumLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DEFAULT_MODULE_PATH } from '../data/catalog';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useI18n } from '../lib/i18n';

interface HomeViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
}

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

export function HomeView({ isDark, onToggleTheme, onOpenSearch }: HomeViewProps) {
  const { isZh } = useI18n();
  const navigate = useNavigate();
  const isCompactNav = !useMediaQuery('(min-width: 640px)');

  return (
    <AppShell
      height="fill"
      variant="surface"
      contentPadding={4}
      topNav={
        <TopNav
          label="Primary navigation"
          heading={
            <TopNavHeading logo={<CesiumLogo size={26} />} heading="Cesiumlab" headingHref="/" />
          }
          centerContent={
            <HStack gap={1} vAlign="center">
              <TopNavItem
                label={isZh ? '文档' : 'Docs'}
                href="/docs/introduction"
                as={({ children, className }) => (
                  <Button
                    label={isZh ? '文档' : 'Docs'}
                    variant="ghost"
                    size="sm"
                    onClick={() => void navigate('/docs/introduction')}
                    className={className}
                  >
                    {children}
                  </Button>
                )}
              />
              <TopNavItem
                label={isZh ? '模块' : 'Modules'}
                href={DEFAULT_MODULE_PATH}
                as={({ children, className }) => (
                  <Button
                    label={isZh ? '模块' : 'Modules'}
                    variant="ghost"
                    size="sm"
                    onClick={() => void navigate(DEFAULT_MODULE_PATH)}
                    className={className}
                  >
                    {children}
                  </Button>
                )}
              />
            </HStack>
          }
          endContent={
            <HStack gap={1} vAlign="center">
              {isCompactNav ? (
                <IconButton
                  label={isZh ? '搜索文档' : 'Search docs'}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon="search" />}
                  onClick={(e) => {
                    if (e.detail > 0) e.currentTarget.blur();
                    onOpenSearch();
                  }}
                />
              ) : (
                <Button
                  label={isZh ? '搜索' : 'Search'}
                  variant="secondary"
                  size="sm"
                  icon={<Icon icon="search" />}
                  endContent={<Kbd keys="mod+k" />}
                  onClick={(e) => {
                    if (e.detail > 0) e.currentTarget.blur();
                    onOpenSearch();
                  }}
                />
              )}
              <LanguageSwitcher />
              <IconButton
                label={
                  isZh
                    ? isDark
                      ? '切换到浅色模式'
                      : '切换到深色模式'
                    : isDark
                      ? 'Switch to light mode'
                      : 'Switch to dark mode'
                }
                tooltip={
                  isZh ? (isDark ? '浅色模式' : '深色模式') : isDark ? 'Light mode' : 'Dark mode'
                }
                variant="ghost"
                size="sm"
                icon={<Icon icon={isDark ? Sun : Moon} />}
                onClick={onToggleTheme}
              />
              <IconButton
                label="GitHub"
                tooltip="GitHub"
                variant="ghost"
                size="sm"
                icon={<Icon icon={Github} />}
                onClick={() => window.open('https://github.com/lumizora/cesiumlab', '_blank')}
              />
            </HStack>
          }
        />
      }
    >
      <VStack hAlign="center" vAlign="center" width="100%" height="100%" paddingBlock={10}>
        <Section maxWidth={840} width="100%" variant="transparent" padding={0}>
          <VStack gap={5} hAlign="center">
            <Heading level={1} type="display-1" justify="center">
              {isZh ? 'CesiumJS 三维特效与空间模块' : 'Modular 3D effects for CesiumJS.'}
            </Heading>
            <VStack maxWidth={600} hAlign="center">
              <Text type="large" color="secondary" justify="center">
                {isZh
                  ? '纯 GPU GLSL 着色器驱动的开源扩展库，框架无关、类型完备、按需引入。'
                  : 'Pure GPU GLSL primitives for CesiumJS — framework-agnostic, fully typed, and ready to compose.'}
              </Text>
            </VStack>

            <HStack gap={3} hAlign="center" vAlign="center" wrap="wrap" paddingBlockStart={3}>
              <Button
                label={isZh ? '快速开始' : 'Get started'}
                variant="primary"
                size="lg"
                endContent={
                  <Icon icon={ArrowRight} size="sm" style={{ transform: 'translateY(-1px)' }} />
                }
                onClick={() => void navigate('/docs/introduction')}
              />
              <CodeBlock code={INSTALL_CMD} language="bash" size="sm" hasLanguageLabel={false} />
            </HStack>
          </VStack>
        </Section>
      </VStack>
    </AppShell>
  );
}
