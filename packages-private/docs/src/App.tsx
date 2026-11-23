import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { Theme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { themes, defaultThemeSlug } from './astryx-themes';
import { useThemeMode } from './hooks/useThemeMode';
import { HomeView } from './components/HomeView';
import { SearchModal } from './components/SearchModal';
import { I18nProvider } from './lib/i18n';

const DocsView = lazy(() =>
  import('./components/DocsView').then((mod) => ({ default: mod.DocsView })),
);
const IntroductionPage = lazy(() =>
  import('./components/GettingStartedPages').then((mod) => ({ default: mod.IntroductionPage })),
);
const InstallationPage = lazy(() =>
  import('./components/GettingStartedPages').then((mod) => ({ default: mod.InstallationPage })),
);
const EffectDemoRoute = lazy(() =>
  import('./components/EffectDemoRoute').then((mod) => ({ default: mod.EffectDemoRoute })),
);

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function PageFallback() {
  return (
    <VStack width="100%" paddingBlock={10} hAlign="center" vAlign="center">
      <Text type="body" color="secondary">
        Loading...
      </Text>
    </VStack>
  );
}

function AppRoutes() {
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const { mode, isDark, toggleTheme } = useThemeMode();

  useHotkeys([
    {
      keys: 'mod+k',
      allowInInputs: true,
      onPress: () => setIsSearchOpen(true),
    },
  ]);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={mode}>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <HomeView
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onOpenSearch={() => setIsSearchOpen(true)}
              />
            }
          />
          <Route
            path="/docs"
            element={
              <DocsView
                isDark={isDark}
                onToggleTheme={toggleTheme}
                onOpenSearch={() => setIsSearchOpen(true)}
              />
            }
          >
            <Route index element={<Navigate to="/docs/introduction" replace />} />
            <Route path="introduction" element={<IntroductionPage />} />
            <Route path="installation" element={<InstallationPage />} />
            <Route path=":demoId" element={<EffectDemoRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </Theme>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppRoutes />
      </BrowserRouter>
    </I18nProvider>
  );
}
