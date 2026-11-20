import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'cesiumlab-theme-mode';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getStoredMode(): ThemeMode | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') {
      return value;
    }
  } catch {
    // 忽略隐私模式或存储受限错误
  }
  return null;
}

function getSystemMode(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function useThemeMode() {
  const [storedMode, setStoredMode] = useState<ThemeMode | null>(() => getStoredMode());
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => getSystemMode());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const mode: ThemeMode = storedMode ?? systemMode;
  const isDark = mode === 'dark';

  const setMode = useCallback((nextMode: ThemeMode) => {
    setStoredMode(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // 忽略存储写入错误
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  return {
    mode,
    isDark,
    isFollowingSystem: storedMode === null,
    setMode,
    toggleTheme,
  };
}
