import { Fragment, useMemo, useState, type AnchorHTMLAttributes } from 'react';
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
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Code } from '@astryxdesign/core/Code';
import { Divider } from '@astryxdesign/core/Divider';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { useClipboard } from '@astryxdesign/core/hooks';
import { Sun, Moon, Github, PanelLeft } from 'lucide-react';
import { NAV_ITEMS, getComponentDoc } from '../data/components';
import { CesiumLogo } from './CesiumLogo';
import { VolumetricCloudStage } from './VolumetricCloudStage';

interface DocsViewProps {
  isDark: boolean;
  activeDoc: string;
  onSelectDoc: (docName: string) => void;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  onNavigateHome: () => void;
}

export function DocsView({
  isDark,
  activeDoc,
  onSelectDoc,
  onToggleTheme,
  onOpenSearch,
  onNavigateHome,
}: DocsViewProps) {
  const doc = getComponentDoc(activeDoc);
  const { isCopied: copiedAi, copy: copyAi } = useClipboard();
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
                onNavigateHome();
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
    [onNavigateHome],
  );

  const handleCopyForAi = () => {
    const markdown = `# ${doc.title}\n\n${doc.description}\n\n## Install\n\`\`\`bash\n${doc.installCmd}\n\`\`\`\n\n## Code\n\`\`\`tsx\n${doc.codeSnippet}\n\`\`\``;
    void copyAi(markdown);
  };

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
                label="Search documentation"
                tooltip="Search (Ctrl+K)"
                variant="ghost"
                size="sm"
                icon={<Icon icon="search" />}
                onClick={onOpenSearch}
              />
              <IconButton
                label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                tooltip={isDark ? 'Light mode' : 'Dark mode'}
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
                onClick={onNavigateHome}
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
                title={group.section}
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
                    key={item.name}
                    label={item.name}
                    size="sm"
                    isSelected={activeDoc === item.name}
                    onClick={() => onSelectDoc(item.name)}
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
          <VStack gap={8}>
            {/* Header Section */}
            <VStack gap={3}>
              <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
                <Heading level={1} textWrap="balance">
                  {doc.title}
                </Heading>
                <Button
                  label={copiedAi ? 'Copied' : 'Copy page'}
                  variant="secondary"
                  size="sm"
                  icon={copiedAi ? <Icon icon="check" /> : undefined}
                  onClick={handleCopyForAi}
                />
              </HStack>
              <Text type="body" color="secondary">
                {doc.description}
              </Text>
            </VStack>

            {/* 核心演示舞台 (Hero Stage) */}
            <VolumetricCloudStage title={doc.title} />

            {/* 安装配置区 (Install) */}
            <VStack gap={4}>
              <Heading level={2}>Install</Heading>
              <Text type="body" color="secondary">
                Add the component to your project using the CLI. It will automatically handle
                dependencies and shader files.
              </Text>
              <CodeBlock code={doc.installCmd} language="bash" width="100%" />

              <VStack gap={3} paddingBlockStart={4}>
                <Heading level={3}>Dependencies</Heading>
                <Text type="body" color="secondary">
                  The install command above adds these automatically. If you copy the source by
                  hand, install them yourself.
                </Text>
                <CodeBlock
                  code={doc.dependencies.join('\n')}
                  language="bash"
                  hasLanguageLabel={false}
                  width="100%"
                />
              </VStack>
            </VStack>

            {/* Code Section */}
            <VStack gap={4}>
              <Heading level={2}>Code</Heading>
              <CodeBlock code={doc.codeSnippet} language="tsx" width="100%" />
            </VStack>

            {/* API Reference Section */}
            <VStack gap={2} paddingBlockEnd={8}>
              <Heading level={2}>API reference</Heading>

              {/* 表头行（无下划线） */}
              <HStack paddingInline={4} paddingBlock={2} gap={4} vAlign="center">
                <StackItem size="fill">
                  <Text type="label" color="secondary">
                    Property
                  </Text>
                </StackItem>
                <HStack width={120} vAlign="center">
                  <Text type="label" color="secondary">
                    Type
                  </Text>
                </HStack>
                <HStack width={100} vAlign="center">
                  <Text type="label" color="secondary">
                    Default
                  </Text>
                </HStack>
              </HStack>

              {/* 属性列表卡片 */}
              <Card padding={0} width="100%">
                <VStack gap={0}>
                  {doc.apiReference.map((prop, idx) => (
                    <Fragment key={prop.property}>
                      {idx > 0 && <Divider />}
                      <VStack gap={2} padding={4}>
                        <HStack gap={4} vAlign="center">
                          <StackItem size="fill">
                            <Text type="code" weight="semibold">
                              {prop.property}
                            </Text>
                          </StackItem>
                          <HStack width={120} vAlign="center">
                            <Code color="secondary">{prop.type}</Code>
                          </HStack>
                          <HStack width={100} vAlign="center">
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
        </Section>
      </VStack>
    </AppShell>
  );
}
