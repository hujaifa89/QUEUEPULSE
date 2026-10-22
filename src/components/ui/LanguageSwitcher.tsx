'use client';

import React, { useEffect, useState } from 'react';
import type { Locale } from '@/i18n';

export interface LanguageSwitcherProps {
  currentLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  currentLocale,
  onLocaleChange,
  className = '',
}) => {
  const [locale, setLocale] = useState<Locale>(() => {
    if (currentLocale) return currentLocale;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('queuepulse_locale');
        if (saved === 'en' || saved === 'bn') return saved;
      } catch {
        // Ignore storage errors
      }
    }
    return 'bn'; // Default to Bangla for Bangladeshi users
  });

  useEffect(() => {
    if (currentLocale && currentLocale !== locale) {
      setLocale(currentLocale);
    }
  }, [currentLocale, locale]);

  const handleSelect = (newLocale: Locale) => {
    setLocale(newLocale);
    try {
      localStorage.setItem('queuepulse_locale', newLocale);
      window.dispatchEvent(new CustomEvent('queuepulse:locale_change', { detail: newLocale }));
    } catch {
      // Ignore storage errors
    }
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    }
  };

  return (
    <div
      role="group"
      aria-label="Language Selector"
      className={`inline-flex items-center p-1 bg-slate-100/80 backdrop-blur-xs rounded-xl border border-slate-200/80 shadow-xs ${className}`}
    >
      <button
        type="button"
        onClick={() => handleSelect('bn')}
        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[38px] min-w-[64px] flex items-center justify-center cursor-pointer ${
          locale === 'bn'
            ? 'bg-[#0F766E] text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
        aria-pressed={locale === 'bn'}
      >
        বাংলা
      </button>

      <button
        type="button"
        onClick={() => handleSelect('en')}
        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[38px] min-w-[64px] flex items-center justify-center cursor-pointer ${
          locale === 'en'
            ? 'bg-[#0F766E] text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
        aria-pressed={locale === 'en'}
      >
        English
      </button>
    </div>
  );
};
