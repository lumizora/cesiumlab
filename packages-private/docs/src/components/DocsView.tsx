import { Fragment, useMemo, useState, type AnchorHTMLAttributes } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import {
  SideNav,
  SideNavHeading,
  SideNavSection,
  SideNavItem,
  SideNavCollapseButton,
} from '@astryxdesign/core/SideNav';
import { LinkProvider } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { Divider } from '@astryxdesign/core/Divider';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Sun, Moon, Github, PanelLeft } from 'lucide-react';
import { NAV_ITEMS } from '../data/components';
import { useI18n } from '../lib/i18n';
import { CesiumLogo } from './CesiumLogo';
import { LanguageSwitcher } from './LanguageSwitcher';

const SECTION_LABELS_ZH: Record<string, string> = {
  'Getting Started': '快速开始',
  'Visual Effects': '视觉特效',
};

const DOC_LABELS_ZH: Record<string, string> = {
  Introduction: '介绍',
  Installation: '安装',
  'Flowing Arc': '飞线 (Flowing Arc)',
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
  const [isSideNavCollapsed, setIsSideNavCollapsed] = useState(false);
  const [isCollapsedBrandHovered, setIsCollapsedBrandHovered] = useState(false);

  const sideNavCollapsible = useMemo(
    () => ({
      isCollapsed: isSideNavCollapsed,
      onCollapsedChange: setIsSideNavCollapsed,
      hasButton: false,
    }),
    [isSideNavCollapsed],
  );

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
              if (href === '#home') {
                e.preventDefault();
                void navigate('/');
              } else if (href === '#expand') {
                e.preventDefault();
                setIsCollapsedBrandHovered(false);
                setIsSideNavCollapsed(false);
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

  return (
    <AppShell
      height="auto"
      variant="wash"
      contentPadding={6}
      topNav={
        <TopNav
          label="Documentation toolbar"
          endContent={
            <HStack gap={1} vAlign="center">
              <IconButton
                label={isZh ? '搜索文档' : 'Search documentation'}
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
                label="5.5k"
                variant="ghost"
                size="sm"
                icon={<Icon icon={Github} />}
                onClick={() => void navigate('/')}
              />
            </HStack>
          }
        />
      }
      sideNav={
        <SideNav
          aria-label="Component documentation navigation"
          collapsible={sideNavCollapsible}
          header={
            <HStack
              width="100%"
              vAlign="center"
              hAlign="between"
              onMouseEnter={() => {
                if (isSideNavCollapsed) setIsCollapsedBrandHovered(true);
              }}
              onMouseLeave={() => setIsCollapsedBrandHovered(false)}
            >
              <StackItem size="fill">
                <LinkProvider component={HomeBrandLink}>
                  <SideNavHeading
                    heading="Cesiumlab"
                    headingHref={isSideNavCollapsed ? '#expand' : '#home'}
                    icon={
                      isSideNavCollapsed ? (
                        isCollapsedBrandHovered ? (
                          <HStack width={26} height={26} hAlign="center" vAlign="center">
                            <Icon icon={PanelLeft} size="sm" />
                          </HStack>
                        ) : (
                          <CesiumLogo size={26} />
                        )
                      ) : undefined
                    }
                  />
                </LinkProvider>
              </StackItem>
              {!isSideNavCollapsed && (
                <SideNavCollapseButton size="sm">
                  <Icon icon={PanelLeft} />
                </SideNavCollapseButton>
              )}
            </HStack>
          }
        >
          {NAV_ITEMS.map((group, groupIdx) => (
            <Fragment key={group.section}>
              {groupIdx > 0 && <Divider />}
              <SideNavSection
                title={isZh ? (SECTION_LABELS_ZH[group.section] ?? group.section) : group.section}
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
                    label={isZh ? (DOC_LABELS_ZH[item.name] ?? item.name) : item.name}
                    size="sm"
                    isSelected={location.pathname === item.path}
                    onClick={() => void navigate(item.path)}
                    endContent={
                      item.isNew ? <StatusDot variant="accent" label="New component" /> : undefined
                    }
                  />
                ))}
              </SideNavSection>
            </Fragment>
          ))}
        </SideNav>
      }
    >
      <VStack hAlign="center" width="100%" paddingBlock={6}>
        <Section maxWidth={896} width="100%" variant="transparent" padding={0}>
          <Outlet />
        </Section>
      </VStack>
    </AppShell>
  );
}
