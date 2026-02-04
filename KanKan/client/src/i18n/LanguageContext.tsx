import React, { createContext, useContext, useMemo, useState } from 'react';

export type Language = 'en' | 'zh';

const translations: Record<Language, Record<string, string>> = {
  en: {
    appName: 'KanKan',
    Chats: 'Chats',
    Contacts: 'Contacts',
    Pa: 'Pa',
    Profile: 'Profile',
    Wa: 'Wa',
  },
  zh: {
    appName: '侃侃',
    Chats: '聊天',
    Contacts: '联系人',
    Pa: '啪',
    Profile: '我的',
    Wa: '娲',
  },
};

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(
    (localStorage.getItem('language') as Language) || 'en'
  );

  const toggleLanguage = () => {
    const next = language === 'en' ? 'zh' : 'en';
    setLanguage(next);
    localStorage.setItem('language', next);
  };

  const value = useMemo(
    () => ({
      language,
      toggleLanguage,
      t: (key: string) => translations[language][key] || key,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};
