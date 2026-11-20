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

interface HomeViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  onNavigateDocs: (docName?: string) => void;
}

export function HomeView({ isDark, onToggleTheme, onOpenSearch, onNavigateDocs }: HomeViewProps) {
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
              headingHref="#home"
            />
          }
          centerContent={
            <HStack gap={1} vAlign="center">
              <TopNavItem
                label="Docs"
                href="#docs"
                as={({ children, className }) => (
                  <Button
                    label="Docs"
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateDocs('Introduction')}
                    className={className}
                  >
                    {children}
                  </Button>
                )}
              />
              <TopNavItem
                label="Components"
                href="#components"
                as={({ children, className }) => (
                  <Button
                    label="Components"
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateDocs('Volumetric Clouds')}
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
                label="Search components"
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
                label="6.5k"
                variant="ghost"
                size="sm"
                icon={<Icon icon={Github} />}
                onClick={() => onNavigateDocs('Volumetric Clouds')}
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
                Interactive 3D geospatial components, in a new dimension.
              </Heading>
              <Text type="large" color="secondary" justify="center" textWrap="pretty">
                An open source library of rich, customizable UI overlays and visual effects for
                CesiumJS. Framework agnostic, performant, and ready to deploy.
              </Text>
              <HStack gap={3} hAlign="center" paddingBlockStart={2}>
                <Button
                  label="Get started"
                  variant="primary"
                  size="lg"
                  endContent={<Icon icon={ArrowRight} />}
                  onClick={() => onNavigateDocs('Volumetric Clouds')}
                />
                <Button
                  label="Browse components"
                  variant="secondary"
                  size="lg"
                  onClick={() => onNavigateDocs('Volumetric Clouds')}
                />
              </HStack>
            </VStack>

            <EarthShowcaseBoard onNavigateDocs={onNavigateDocs} />
          </VStack>
        </Section>
      </VStack>
    </AppShell>
  );
}
