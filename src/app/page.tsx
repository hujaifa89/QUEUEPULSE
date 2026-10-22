'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { t, type Locale } from '@/i18n';
import { LanguageSwitcher } from '@/components/ui';

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('bn');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('queuepulse_locale');
      if (saved === 'en' || saved === 'bn') {
        setLocale(saved);
      }
    } catch {
      // Ignore storage errors
    }

    const handleLocaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<Locale>;
      if (customEvent.detail === 'en' || customEvent.detail === 'bn') {
        setLocale(customEvent.detail);
      }
    };

    window.addEventListener('queuepulse:locale_change', handleLocaleChange);
    return () => {
      window.removeEventListener('queuepulse:locale_change', handleLocaleChange);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 sm:p-8 md:p-16 bg-gradient-to-b from-white via-slate-50/50 to-teal-50/30">
      {/* Top Navbar with Language Switcher */}
      <header className="w-full max-w-5xl flex items-center justify-between pb-8 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-[#0F766E] flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
            Q
          </div>
          <span className="text-xl font-extrabold text-slate-900 tracking-tight">
            Queue<span className="text-[#0F766E]">Pulse</span>
          </span>
        </div>

        {/* One-Click Language Switcher (Bangla / English) */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
        </div>
      </header>

      {/* Hero Content */}
      <div className="z-10 max-w-4xl w-full flex flex-col items-center text-center space-y-8 my-auto py-12">
        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#0F766E] animate-pulse" />
          {t(locale, 'home_badge')}
        </div>

        {/* Hero Title */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            {t(locale, 'home_hero_title')}
          </h1>
          <p className="max-w-2xl text-base sm:text-lg text-slate-600 mx-auto font-normal leading-relaxed">
            {t(locale, 'home_hero_subtitle')}
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-6 text-left">
          <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-teal-100/70 text-[#0F766E] flex items-center justify-center font-bold text-lg mb-4">
              1
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {t(locale, 'home_feature1_title')}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t(locale, 'home_feature1_desc')}
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-teal-100/70 text-[#0F766E] flex items-center justify-center font-bold text-lg mb-4">
              2
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {t(locale, 'home_feature2_title')}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t(locale, 'home_feature2_desc')}
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-teal-100/70 text-[#0F766E] flex items-center justify-center font-bold text-lg mb-4">
              3
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {t(locale, 'home_feature3_title')}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t(locale, 'home_feature3_desc')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-8 flex flex-wrap gap-4 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 min-h-[48px] min-w-[48px] rounded-xl font-bold text-white bg-[#0F766E] hover:bg-[#0D655E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 transition-all shadow-sm hover:shadow"
          >
            {t(locale, 'home_btn_login')} &rarr;
          </Link>
          <Link
            href="/api/health"
            className="inline-flex items-center justify-center px-6 min-h-[48px] min-w-[48px] rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 transition-all shadow-xs"
          >
            {t(locale, 'home_btn_health')}
          </Link>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs text-slate-500">
        {t(locale, 'home_footer')}
      </footer>
    </main>
  );
}
