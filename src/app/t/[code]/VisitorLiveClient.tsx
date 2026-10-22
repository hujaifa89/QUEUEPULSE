'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useQueueLive } from '@/features/live';
import { peopleAhead, etaMinutes } from '@/features/queue/eta';
import { t, type Locale } from '@/i18n';
import { StatusBadge, Banner, LanguageSwitcher } from '@/components/ui';

export interface TokenViewData {
  token_number: number;
  status: string;
  queue_id: string;
  queue_name: string;
  service_date: string;
  serving_number: number | null;
  waiting_numbers: number[];
  avg_service_minutes: number;
  queue_status: string;
  version: number;
}

export interface VisitorLiveClientProps {
  code: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function VisitorLiveClient({ code }: VisitorLiveClientProps) {
  // Locale state: default to 'bn' (Bangla) per requirement 4, persisted safely in localStorage
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('queuepulse_locale');
        if (saved === 'en' || saved === 'bn') return saved;
      } catch {
        // Fallback safely if localStorage is restricted
      }
    }
    return 'bn';
  });

  useEffect(() => {
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

  const [tokenData, setTokenData] = useState<TokenViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [nearTurnAlertDismissed, setNearTurnAlertDismissed] = useState(false);
  const [hasAlerted, setHasAlerted] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(`queuepulse_alert_${code}`) === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  // Push notification states: idle | subscribing | subscribed | unsupported | denied
  const [pushStatus, setPushStatus] = useState<
    'idle' | 'subscribing' | 'subscribed' | 'unsupported' | 'denied'
  >('idle');
  const [pushErrorMsg, setPushErrorMsg] = useState('');

  const toggleLanguage = () => {
    const nextLocale: Locale = locale === 'bn' ? 'en' : 'bn';
    setLocale(nextLocale);
    try {
      localStorage.setItem('queuepulse_locale', nextLocale);
    } catch {
      // Ignore storage errors
    }
  };

  // Fetch token view from PostgreSQL function get_token_view(p_code)
  const fetchTokenView = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_token_view', {
        p_code: code,
      });

      if (error || !data || !Array.isArray(data) || data.length === 0) {
        setNotFound(true);
        return;
      }

      const row = data[0] as TokenViewData;
      setTokenData(row);
      setNotFound(false);
    } catch {
      // On network failure, don't clobber existing tokenData
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchTokenView();
  }, [fetchTokenView]);

  // Check if push is already subscribed or if browser is unsupported
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }

    navigator.serviceWorker.ready
      .then((reg) => {
        reg.pushManager
          .getSubscription()
          .then((sub) => {
            if (sub) {
              setPushStatus('subscribed');
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  // Realtime Broadcast Hook: updates instantly when queue state changes
  const { isReconnecting, syncVersion } = useQueueLive(tokenData?.queue_id, {
    initialVersion: tokenData?.version ?? 0,
    onRefresh: fetchTokenView,
    onStateUpdate: (newState) => {
      setTokenData((prev) => {
        if (!prev) return null;

        let currentStatus = prev.status;
        // If my token was waiting and is now serving
        if (prev.status === 'waiting' && newState.serving_number === prev.token_number) {
          currentStatus = 'serving';
        }

        return {
          ...prev,
          serving_number: newState.serving_number,
          waiting_numbers: newState.waiting_numbers,
          avg_service_minutes: newState.avg_service_minutes,
          queue_status: newState.status,
          version: newState.version,
          status: currentStatus,
        };
      });
    },
    pollIntervalMs: 10000,
  });

  // Sync version whenever tokenData changes from RPC
  useEffect(() => {
    if (tokenData?.version) {
      syncVersion(tokenData.version);
    }
  }, [tokenData?.version, syncVersion]);

  // Compute people ahead and estimated wait time (FR-11)
  const ahead = useMemo(() => {
    if (!tokenData) return 0;
    return peopleAhead(
      tokenData.waiting_numbers,
      tokenData.serving_number,
      tokenData.token_number,
    );
  }, [tokenData]);

  const estimatedMinutes = useMemo(() => {
    if (!tokenData || tokenData.queue_status === 'paused') {
      return 0;
    }
    return etaMinutes(ahead, tokenData.avg_service_minutes);
  }, [ahead, tokenData]);

  // In-page Near-Turn Alert (FR-12 & Requirement 5)
  // When peopleAhead first becomes 3 or fewer for a waiting token
  useEffect(() => {
    if (!tokenData) return;

    if (tokenData.status === 'waiting' && ahead <= 3 && !hasAlerted) {
      setHasAlerted(true);

      try {
        localStorage.setItem(`queuepulse_alert_${code}`, 'true');
      } catch {
        // Safe when localStorage is blocked
      }

      // Safe vibration trigger without depending on sound
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([200, 100, 200]);
        }
      } catch {
        // Ignore vibration errors
      }
    }
  }, [ahead, tokenData, code, hasAlerted]);

  // Handle Web Push "Alert me" Button Tap (Requirement 3)
  const handleSubscribePush = async () => {
    setPushErrorMsg('');
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }

    setPushStatus('subscribing');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });

      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');

      const res = await fetch(`/api/public/tokens/${code}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(p256dhKey),
          auth: arrayBufferToBase64(authKey),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Failed to register push subscription');
      }

      setPushStatus('subscribed');
    } catch (err: unknown) {
      setPushStatus('idle');
      setPushErrorMsg(err instanceof Error ? err.message : 'Subscription failed');
    }
  };

  // -------------------------------------------------------------
  // Render States: Loading, Not Found, Success
  // -------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="h-10 w-10 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-600 font-medium text-sm">{t(locale, 'loading')}</p>
      </div>
    );
  }

  if (notFound || !tokenData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4">
          <div className="h-12 w-12 bg-red-50 text-red-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {t(locale, 'error_token_not_found')}
          </h1>
          <p className="text-xs text-slate-500">
            Please make sure the link or QR code scanned is correct.
          </p>
          <div className="pt-2">
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg min-h-[44px]"
            >
              {locale === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isServingMe = tokenData.status === 'serving' || tokenData.serving_number === tokenData.token_number;
  const isWaiting = tokenData.status === 'waiting' && !isServingMe;
  const isPaused = tokenData.queue_status === 'paused';

  // Status message translation
  const getStatusText = () => {
    if (isServingMe) return t(locale, 'status_serving');
    if (tokenData.status === 'completed') return t(locale, 'status_completed');
    if (tokenData.status === 'skipped') return t(locale, 'status_skipped');
    if (tokenData.status === 'cancelled') return t(locale, 'status_cancelled');
    if (tokenData.status === 'expired') return t(locale, 'status_expired');
    if (isPaused) return t(locale, 'status_paused');
    return t(locale, 'status_waiting');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between pb-10">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 py-3 px-4 sm:px-6 sticky top-0 z-30">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#0F766E] flex items-center justify-center text-white font-bold text-base shadow-xs">
              Q
            </div>
            <div>
              <span className="font-extrabold text-slate-900 tracking-tight text-base block leading-none">
                {t(locale, 'app_name')}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {tokenData.queue_name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
          </div>
        </div>
      </header>

      {/* Main Container - Mobile First from 360px */}
      <main className="max-w-md w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Reconnecting Banner */}
        {isReconnecting && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold rounded-xl animate-pulse"
          >
            <span className="h-2 w-2 rounded-full bg-amber-600 animate-ping" />
            <span>{t(locale, 'reconnecting')}</span>
          </div>
        )}

        {/* Near-Turn Alert Banner (Visual, sound-independent) */}
        {hasAlerted && isWaiting && !nearTurnAlertDismissed && (
          <Banner
            variant="warning"
            onClose={() => setNearTurnAlertDismissed(true)}
            className="shadow-sm"
          >
            <div className="space-y-0.5">
              <strong className="block text-sm font-bold">
                {t(locale, 'near_turn_alert')}
              </strong>
              <p className="text-xs text-amber-800">
                {t(locale, 'near_turn_alert_desc')}
              </p>
            </div>
          </Banner>
        )}

        {/* Queue Status Callout */}
        {isPaused && (
          <div className="p-3 bg-orange-50 border border-orange-200 text-orange-900 text-xs font-medium rounded-xl text-center">
            {t(locale, 'status_paused')}
          </div>
        )}

        {/* Serving Big Display Card */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {t(locale, 'serving_number')}
          </span>

          {/* 64px Bold Serving Number */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="text-[64px] font-black leading-none tracking-tight text-[#0F766E] font-mono select-all my-2"
          >
            {tokenData.serving_number !== null && tokenData.serving_number !== undefined
              ? `#${tokenData.serving_number}`
              : '—'}
          </div>

          {/* Queue Date */}
          <div className="text-xs text-slate-400 font-mono">
            {tokenData.service_date}
          </div>
        </section>

        {/* Visitor's Personal Token Card */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                {t(locale, 'your_number')}
              </span>
              <span className="text-3xl font-black font-mono text-slate-900">
                #{tokenData.token_number}
              </span>
            </div>

            <div>
              <StatusBadge status={tokenData.status} />
            </div>
          </div>

          {/* Accessible Status Announcement Region */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className={`p-4 rounded-2xl text-center font-bold text-sm ${
              isServingMe
                ? 'bg-teal-50 text-[#0F766E] border-2 border-teal-500 animate-pulse'
                : tokenData.status === 'skipped'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                  : tokenData.status === 'cancelled' || tokenData.status === 'expired'
                    ? 'bg-red-50 text-red-900 border border-red-200'
                    : 'bg-slate-50 text-slate-800'
            }`}
          >
            {getStatusText()}
          </div>

          {/* Waiting Status Metrics: People Ahead & Estimated Wait Time */}
          {isWaiting && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* People Ahead */}
              <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100">
                <span className="text-[11px] font-bold uppercase text-slate-400 block">
                  {t(locale, 'people_ahead')}
                </span>
                <span className="text-2xl font-black font-mono text-slate-800 mt-1 block">
                  {ahead}
                </span>
              </div>

              {/* Estimated Wait */}
              <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100">
                <span className="text-[11px] font-bold uppercase text-slate-400 block">
                  {t(locale, 'estimated_wait')}
                </span>
                <span className="text-sm font-bold text-[#0F766E] mt-2 block">
                  {isPaused ? '—' : t(locale, 'about_minutes', { count: estimatedMinutes })}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Push Notification "Alert me" Card (Requirement 3) */}
        {isWaiting && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {t(locale, 'alert_me')}
                </h2>
                <p className="text-xs text-slate-500">
                  Get notified when your turn is 3 people away.
                </p>
              </div>
            </div>

            {pushErrorMsg && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {pushErrorMsg}
              </div>
            )}

            {pushStatus === 'subscribed' ? (
              <div className="p-3 bg-teal-50 border border-teal-200 text-[#0F766E] text-xs font-semibold rounded-xl flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#0F766E]" />
                <span>{t(locale, 'push_subscribed')}</span>
              </div>
            ) : pushStatus === 'denied' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl">
                {t(locale, 'push_denied')}
              </div>
            ) : pushStatus === 'unsupported' ? (
              <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-xl">
                {t(locale, 'push_unsupported')}
              </div>
            ) : (
              <button
                onClick={handleSubscribePush}
                disabled={pushStatus === 'subscribing'}
                className="w-full min-h-[44px] bg-[#0F766E] hover:bg-[#0d645e] text-white font-bold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2"
                id="alert-me-button"
              >
                {pushStatus === 'subscribing' ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Subscribing...</span>
                  </>
                ) : (
                  <span>{t(locale, 'alert_me')}</span>
                )}
              </button>
            )}

            {/* iPhone plain-text notice per requirement 3 */}
            <p className="text-[11px] text-slate-400 leading-normal">
              {t(locale, 'push_ios_note')}
            </p>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto px-6 text-center text-[11px] text-slate-400 space-y-1">
        <p>QueuePulse &middot; {t(locale, 'tagline')}</p>
        <p>No app or sign-up needed &middot; Live real-time updates</p>
      </footer>
    </div>
  );
}
