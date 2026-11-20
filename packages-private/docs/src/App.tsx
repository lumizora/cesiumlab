import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { Theme } from '@astryxdesign/core/theme';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { themes, defaultThemeSlug } from './astryx-themes';
import { useThemeMode } from './hooks/useThemeMode';
import { HomeView } from './components/HomeView';
import { DocsView } from './components/DocsView';
import { InstallationPage, IntroductionPage } from './components/GettingStartedPages';
import { SearchModal } from './components/SearchModal';
import { getEffectDemo } from './lib/effectDemos';
import { I18nProvider } from './lib/i18n';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function EffectDemoRoute() {
  const { demoId } = useParams<{ demoId: string }>();
  const entry = demoId ? getEffectDemo(demoId) : undefined;

  if (!entry) {
    return <Navigate to="/docs/introduction" replace />;
  }

  const DemoComponent = entry.Component;
  return <DemoComponent />;
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
