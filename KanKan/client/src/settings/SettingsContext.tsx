import React, { createContext, useContext, useMemo, useState } from 'react';

type TimeZoneSetting = string;

interface SettingsContextValue {
  timeZone: TimeZoneSetting;
  setTimeZone: (timeZone: TimeZoneSetting) => void;
  formatDateTime: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const defaultTimeZone = 'Asia/Shanghai';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timeZone, setTimeZoneState] = useState<TimeZoneSetting>(
    localStorage.getItem('timeZone') || defaultTimeZone
  );

  const setTimeZone = (next: TimeZoneSetting) => {
    setTimeZoneState(next);
    localStorage.setItem('timeZone', next);
  };

  const formatDateTime = (iso: string, options?: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        ...options,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatTime = (iso: string, options?: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        ...options,
      }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  const value = useMemo(
    () => ({
      timeZone,
      setTimeZone,
      formatDateTime,
      formatTime,
    }),
    [timeZone]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
};
