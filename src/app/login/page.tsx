'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button, TextField, Banner, LanguageSwitcher } from '@/components/ui';
import { t, type Locale } from '@/i18n';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '';
  const errorParam = searchParams.get('error');

  const [locale, setLocale] = useState<Locale>('bn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('queuepulse_locale');
      if (saved === 'en' || saved === 'bn') {
        setLocale(saved);
      }
    } catch {
      // Ignore storage errors
    }

    if (errorParam === 'inactive') {
      setErrorMessage(t(locale, 'login_inactive'));
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
  }, [errorParam, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        // SEC-01 / FR-01: Wrong credentials give ONE generic error
        setErrorMessage(t(locale, 'login_invalid'));
        setIsLoading(false);
        return;
      }

      // Check profile status
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile || !profile.is_active) {
        // Sign out immediately if profile is inactive
        await supabase.auth.signOut();
        setErrorMessage(t(locale, 'login_inactive'));
        setIsLoading(false);
        return;
      }

      // Role-based routing
      if (redirectPath) {
        router.push(redirectPath);
      } else if (profile.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch {
      setErrorMessage(t(locale, 'login_invalid'));
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 sm:p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 space-y-6">
        {/* Language Switcher Row */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <Link
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            {t(locale, 'login_back_home')}
          </Link>
          <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t(locale, 'login_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {t(locale, 'login_subtitle')}
          </p>
        </div>

        {errorMessage && (
          <Banner variant="danger" title={locale === 'bn' ? 'লগইন ত্রুটি' : 'Authentication Error'}>
            {errorMessage}
          </Banner>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label={t(locale, 'login_email_label')}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(locale, 'login_email_placeholder')}
            disabled={isLoading}
          />

          <TextField
            label={t(locale, 'login_password_label')}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(locale, 'login_password_placeholder')}
            disabled={isLoading}
          />

          <div className="flex items-center justify-end">
            <Link
              href="/reset"
              className="text-xs font-semibold text-[#0F766E] hover:underline"
            >
              {locale === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="w-full mt-2 font-bold py-2.5 rounded-xl"
          >
            {isLoading ? t(locale, 'login_btn_submitting') : t(locale, 'login_btn_submit')}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          {locale === 'bn' ? 'টোকেন সিরিয়াল দেখতে চান? ' : 'Visitor looking for your serial? '}
          <Link href="/" className="text-[#0F766E] font-bold hover:underline">
            {locale === 'bn' ? 'হোম পেজে যান' : 'Go to Home'}
          </Link>
        </div>
      </div>
    </main>
  );
}

// useSearchParams() requires a Suspense boundary so the page can be prerendered at build time
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
