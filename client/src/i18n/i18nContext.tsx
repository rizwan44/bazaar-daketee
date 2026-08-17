import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import en from '../locales/en.json';
import romanUr from '../locales/roman-ur.json';
import ur from '../locales/ur.json';

export type Language = 'en' | 'ur' | 'roman-ur';

const DICTIONARIES: Record<Language, Record<string, string>> = {
  en,
  ur,
  'roman-ur': romanUr,
};

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'card-games:language';

function readInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ur' || stored === 'roman-ur' ? stored : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    window.localStorage.setItem(STORAGE_KEY, lang);
  };

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = DICTIONARIES[language];
    return {
      language,
      setLanguage,
      t: (key: string) => dictionary[key] ?? DICTIONARIES.en[key] ?? key,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
