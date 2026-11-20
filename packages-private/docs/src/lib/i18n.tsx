import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'zh-CN';

export type LocalizedText = string | { readonly en: string; readonly 'zh-CN': string };

const STORAGE_KEY = 'cesiumlab-docs-locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-CN') return saved;
  } catch {
    // Ignore storage access errors.
  }
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function resolveText(value: LocalizedText, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale];
}

interface I18nContextValue {
  locale: Locale;
  isZh: boolean;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  isZh: false,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage access errors.
    }
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
  };

  return (
    <I18nContext.Provider value={{ locale, isZh: locale === 'zh-CN', setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
