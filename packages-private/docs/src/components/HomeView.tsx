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
import { Sun, Moon, Github, ArrowRight } from 'lucide-react';
import { CesiumLogo } from './CesiumLogo';
import { EarthShowcaseBoard } from './EarthShowcaseBoard';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DEFAULT_DOC_PATH } from '../data/components';
import { useI18n } from '../lib/i18n';

interface HomeViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
}

export function HomeView({ isDark, onToggleTheme, onOpenSearch }: HomeViewProps) {
  const { isZh } = useI18n();
  const navigate = useNavigate();

  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={4}
      topNav={
        <TopNav
          label="Primary navigation"
          heading={
            <TopNavHeading
              logo={<CesiumLogo size={28} />}
              heading="Cesiumlab"
              headingHref="/"
            />
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
                    onClick={() => navigate('/docs/introduction')}
                    className={className}
                  >
                    {children}
                  </Button>
                )}
              />
              <TopNavItem
                label={isZh ? '模块' : 'Modules'}
                href={DEFAULT_DOC_PATH}
                as={({ children, className }) => (
                  <Button
                    label={isZh ? '模块' : 'Modules'}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(DEFAULT_DOC_PATH)}
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
              <IconButton
                label={isZh ? '搜索文档' : 'Search components'}
                tooltip={isZh ? '搜索 (Ctrl+K)' : 'Search (Ctrl+K)'}
                variant="ghost"
                size="sm"
                icon={<Icon icon="search" />}
                onClick={(e) => {
                  if (e.detail > 0) e.currentTarget.blur();
                  onOpenSearch();
                }}
              />
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
              <Button
                label="6.5k"
                variant="ghost"
                size="sm"
                icon={<Icon icon={Github} />}
                onClick={() => navigate(DEFAULT_DOC_PATH)}
              />
            </HStack>
          }
        />
      }
    >
      <VStack hAlign="center" width="100%" paddingBlock={10}>
        <Section maxWidth={1120} width="100%" variant="transparent" padding={0}>
          <VStack gap={8} hAlign="center">
            <VStack gap={4} hAlign="center" maxWidth={760}>
              <Heading level={1} type="display-1" justify="center" textWrap="balance">
                {isZh
                  ? '面向 CesiumJS 的模块化三维地理空间能力库'
                  : 'Modular 3D geospatial packages for CesiumJS.'}
              </Heading>
              <Text type="large" color="secondary" justify="center" textWrap="pretty">
                {isZh
                  ? '面向 CesiumJS 的开源模块化工具与能力集合，涵盖视觉特效、空间分析与交互扩展。框架无关、类型完备、按需引入。'
                  : 'An open-source collection of framework-agnostic packages for CesiumJS — from visual effects to spatial utilities and interactive modules. Typed, composable, and ready to ship.'}
              </Text>
              <HStack gap={3} hAlign="center" paddingBlockStart={2}>
                <Button
                  label={isZh ? '快速开始' : 'Get started'}
                  variant="primary"
                  size="lg"
                  endContent={<Icon icon={ArrowRight} />}
                  onClick={() => navigate('/docs/introduction')}
                />
                <Button
                  label={isZh ? '浏览模块' : 'Explore modules'}
                  variant="secondary"
                  size="lg"
                  onClick={() => navigate(DEFAULT_DOC_PATH)}
                />
              </HStack>
            </VStack>

            <EarthShowcaseBoard onNavigateDocs={(path) => navigate(path ?? DEFAULT_DOC_PATH)} />
          </VStack>
        </Section>
      </VStack>
    </AppShell>
  );
}
