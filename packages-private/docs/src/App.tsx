import { useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { useHotkeys } from '@astryxdesign/core/hooks';
import { themes, defaultThemeSlug } from './astryx-themes';
import { useThemeMode } from './hooks/useThemeMode';
import { HomeView } from './components/HomeView';
import { DocsView } from './components/DocsView';
import { SearchModal } from './components/SearchModal';

type ViewMode = 'home' | 'docs';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [activeDoc, setActiveDoc] = useState<string>('Volumetric Clouds');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const { mode, isDark, toggleTheme } = useThemeMode();

  useHotkeys([
    {
      keys: 'mod+k',
      allowInInputs: true,
      onPress: () => setIsSearchOpen(true),
    },
  ]);

  const handleNavigateDocs = (docName?: string) => {
    if (docName) {
      setActiveDoc(docName);
    }
    setCurrentView('docs');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleNavigateHome = () => {
    setCurrentView('home');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={mode}>
      {currentView === 'home' ? (
        <HomeView
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
          onNavigateDocs={handleNavigateDocs}
        />
      ) : (
        <DocsView
          isDark={isDark}
          activeDoc={activeDoc}
          onSelectDoc={(name) => setActiveDoc(name)}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
          onNavigateHome={handleNavigateHome}
        />
      )}

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectDoc={(docName) => handleNavigateDocs(docName)}
      />
    </Theme>
  );
}
