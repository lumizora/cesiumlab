import { Fragment, useMemo, useRef, type AnchorHTMLAttributes } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { SideNav, SideNavSection, SideNavItem } from '@astryxdesign/core/SideNav';
import { LinkProvider } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Divider } from '@astryxdesign/core/Divider';
import { Kbd } from '@astryxdesign/core/Kbd';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowLeft, ArrowRight, Github, Moon, Sun } from 'lucide-react';
import { NAV_ITEMS } from '../data/components';
import { DocsPageProvider } from '../lib/docsPage';
import { useI18n } from '../lib/i18n';
import { CesiumLogo } from './CesiumLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { TableOfContents } from './TableOfContents';

const SECTION_LABELS_ZH: Record<string, string> = {
  'Getting Started': '快速开始',
  'Visual Effects': '视觉特效',
};

const DOC_LABELS_ZH: Record<string, string> = {
  Introduction: '介绍',
  Installation: '安装',
  'Comet Arc': '拖尾飞线 (Comet Arc)',
  'Pulse Ring': '扩散波纹 (Pulse Ring)',
  'Energy Beam': '全息光束 (Energy Beam)',
  'Energy Wall': '流光电子围栏 (Energy Wall)',
  'Radar Scan': '雷达扫描扇面 (Radar Scan)',
  'Holo Dome': '全息能量穹顶 (Holo Dome)',
  'Ground Flow Path': '贴地流光路径 (Ground Flow Path)',
};

interface DocsViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
}

export function DocsView({ isDark, onToggleTheme, onOpenSearch }: DocsViewProps) {
  const { isZh } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const isCompactNav = !useMediaQuery('(min-width: 640px)');
  const showToc = useMediaQuery('(min-width: 1180px)');
  const contentRef = useRef<HTMLDivElement>(null);

  const flatItems = useMemo(
    () =>
      NAV_ITEMS.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          section: group.section,
        })),
      ),
    [],
  );

  const currentIdx = flatItems.findIndex((item) => item.path === location.pathname);
  const prevItem = currentIdx > 0 ? flatItems[currentIdx - 1] : undefined;
  const nextItem =
    currentIdx >= 0 && currentIdx < flatItems.length - 1 ? flatItems[currentIdx + 1] : undefined;

  const HomeBrandLink = useMemo(
    () =>
      function HomeBrandLink({
        href,
        onClick,
        children,
        ...props
      }: AnchorHTMLAttributes<HTMLAnchorElement>) {
        return (
          <a
            href={href}
            onClick={(e) => {
              if (href === '/') {
                e.preventDefault();
                void navigate('/');
              }
              onClick?.(e);
            }}
            {...props}
          >
            {children}
          </a>
        );
      },
    [navigate],
  );

  const formatDocLabel = (name: string) => (isZh ? (DOC_LABELS_ZH[name] ?? name) : name);
  const formatSectionLabel = (section: string) =>
    isZh ? (SECTION_LABELS_ZH[section] ?? section) : section;

  return (
    <DocsPageProvider>
      <AppShell
        height="auto"
        variant="surface"
        contentPadding={0}
        topNav={
          <TopNav
            label="Documentation toolbar"
            heading={
              <LinkProvider component={HomeBrandLink}>
                <TopNavHeading
                  logo={<CesiumLogo size={26} />}
                  heading="Cesiumlab"
                  headingHref="/"
                />
              </LinkProvider>
            }
            endContent={
              <HStack gap={1} vAlign="center">
                {isCompactNav ? (
                  <IconButton
                    label={isZh ? '搜索文档' : 'Search documentation'}
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
        sideNav={
          <SideNav aria-label="Component documentation navigation">
            {NAV_ITEMS.map((group, groupIdx) => (
              <Fragment key={group.section}>
                {groupIdx > 0 && <Divider />}
                <SideNavSection
                  title={formatSectionLabel(group.section)}
                  endContent={
                    group.count !== undefined ? (
                      <Text type="supporting" size="xsm" hasTabularNumbers>
                        {group.count}
                      </Text>
                    ) : undefined
                  }
                >
                  {group.items.map((item) => (
                    <SideNavItem
                      key={item.path}
                      label={formatDocLabel(item.name)}
                      size="sm"
                      isSelected={location.pathname === item.path}
                      onClick={() => void navigate(item.path)}
                    />
                  ))}
                </SideNavSection>
              </Fragment>
            ))}
          </SideNav>
        }
      >
        <VStack
          hAlign="center"
          width="100%"
          paddingInline={isCompactNav ? 4 : 6}
          paddingBlock={isCompactNav ? 5 : 8}
          style={{
            minHeight: 'calc(100dvh - 3.5rem)',
            backgroundImage: 'var(--effect-film-grain)',
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
          }}
        >
          <HStack maxWidth={1180} width="100%" gap={10} vAlign="start" hAlign="center">
            <StackItem size="fill" style={{ minWidth: 0, maxWidth: 880 }}>
              <Section width="100%" variant="transparent" padding={0}>
                <VStack gap={6}>
                  <div ref={contentRef}>
                    <Outlet />
                  </div>

                  {(prevItem || nextItem) && (
                    <VStack gap={4} paddingBlockStart={2} paddingBlockEnd={8}>
                      <Grid columns={{ minWidth: 240, max: 2 }} gap={4}>
                        {prevItem ? (
                          <Card padding={4} width="100%">
                            <HStack hAlign="between" vAlign="center">
                              <VStack gap={0.5}>
                                <Text type="supporting" size="xsm">
                                  {isZh ? '上一页' : 'Previous'}
                                </Text>
                                <Button
                                  label={formatDocLabel(prevItem.name)}
                                  variant="ghost"
                                  size="sm"
                                  icon={<Icon icon={ArrowLeft} />}
                                  onClick={() => void navigate(prevItem.path)}
                                />
                              </VStack>
                            </HStack>
                          </Card>
                        ) : (
                          <VStack />
                        )}

                        {nextItem ? (
                          <Card padding={4} width="100%">
                            <HStack hAlign="end" vAlign="center">
                              <VStack gap={0.5} hAlign="end">
                                <Text type="supporting" size="xsm">
                                  {isZh ? '下一页' : 'Next'}
                                </Text>
                                <Button
                                  label={formatDocLabel(nextItem.name)}
                                  variant="ghost"
                                  size="sm"
                                  endContent={<Icon icon={ArrowRight} />}
                                  onClick={() => void navigate(nextItem.path)}
                                />
                              </VStack>
                            </HStack>
                          </Card>
                        ) : (
                          <VStack />
                        )}
                      </Grid>
                    </VStack>
                  )}
                </VStack>
              </Section>
            </StackItem>

            {showToc && <TableOfContents contentRef={contentRef} routeKey={location.pathname} />}
          </HStack>
        </VStack>
      </AppShell>
    </DocsPageProvider>
  );
}
