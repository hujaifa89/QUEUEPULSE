'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button, TextField, Banner, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, LanguageSwitcher } from '@/components/ui';
import { t, type Locale } from '@/i18n';

interface QueueState {
  service_date: string;
  serving_number: number | null;
  last_issued: number;
  waiting_numbers: number[];
  avg_service_minutes: number;
  status: string;
  version: number;
}

interface Queue {
  id: string;
  org_id: string;
  name: string;
  default_service_minutes: number;
  is_active: boolean;
  created_at: string;
  queue_state: QueueState | null;
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Create Queue Form State
  const [locale, setLocale] = useState<Locale>('bn');
  const [queueName, setQueueName] = useState('');
  const [defaultMinutes, setDefaultMinutes] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('queuepulse_locale');
      if (saved === 'en' || saved === 'bn') {
        setLocale(saved);
      }
    } catch {
      // Ignore
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

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch('/api/queues');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.status === 403) {
        router.push('/403');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorBanner(data.error?.message || 'Failed to load queues');
        return;
      }

      const data = await res.json();
      setQueues(data.queues || []);
    } catch {
      setErrorBanner('Network error: Unable to load queues. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchQueues();

    const onFocus = () => fetchQueues();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(fetchQueues, 10000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [fetchQueues]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setErrorBanner('');
    setSuccessBanner('');

    const trimmedName = queueName.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 60) {
      setFormError('Queue name must be between 2 and 60 characters');
      return;
    }

    const minutes = parseInt(defaultMinutes, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 120) {
      setFormError('Default service minutes must be between 1 and 120');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/queues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          default_service_minutes: minutes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error?.message || 'Failed to create queue');
        return;
      }

      setSuccessBanner(`Queue "${data.queue.name}" created successfully!`);
      setQueueName('');
      setDefaultMinutes('5');
      await fetchQueues();
    } catch {
      setFormError('Network error: Unable to create queue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#0F766E] flex items-center justify-center text-white font-bold text-lg shadow-xs">
              Q
            </div>
            <div>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">QueuePulse</span>
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-teal-50 text-[#0F766E] rounded-md">
                Staff
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
            <Link
              href="/dashboard/reports"
              className="text-xs font-bold text-slate-700 hover:text-slate-900 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 min-h-[44px] flex items-center"
            >
              {t(locale, 'dashboard_reports')}
            </Link>
            <Button variant="outline" onClick={handleSignOut} id="dashboard-signout-btn" className="min-h-[44px]">
              {t(locale, 'dashboard_signout')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t(locale, 'dashboard_title')}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {locale === 'bn' ? 'আপনার প্রতিষ্ঠানের কিউ ও সিরিয়াল পরিচালনা করুন।' : "Manage your organization's queues, issue tokens, and control customer flow."}
          </p>
        </div>

        {errorBanner && (
          <Banner variant="danger" onClose={() => setErrorBanner('')}>
            {errorBanner}
          </Banner>
        )}

        {successBanner && (
          <Banner variant="success" onClose={() => setSuccessBanner('')}>
            {successBanner}
          </Banner>
        )}

        {/* Create Queue Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Create New Queue</h2>
          <p className="text-xs text-slate-500 mb-4">
            Add a department, counter, or doctor chamber queue to your organization.
          </p>

          <form onSubmit={handleCreateQueue} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg" role="alert">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <TextField
                  id="create-queue-name"
                  label="Queue Name"
                  placeholder="e.g. General Consultation or Cash Counter 1"
                  value={queueName}
                  onChange={(e) => setQueueName(e.target.value)}
                  required
                />
              </div>

              <div>
                <TextField
                  id="create-queue-minutes"
                  label="Default Minutes / Visitor"
                  type="number"
                  min="1"
                  max="120"
                  value={defaultMinutes}
                  onChange={(e) => setDefaultMinutes(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                className="min-h-[44px] px-6"
                id="create-queue-submit"
              >
                Create Queue
              </Button>
            </div>
          </form>
        </div>

        {/* Queue List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Active Queues</h2>
            <span className="text-xs text-slate-500 font-medium">Auto-updates every 10s</span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <div className="inline-block animate-spin h-8 w-8 border-4 border-[#0F766E] border-t-transparent rounded-full" />
              <p className="mt-3 text-sm text-slate-600 font-medium">Loading queues...</p>
            </div>
          ) : queues.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <p className="text-base font-semibold text-slate-800">No queues found</p>
              <p className="text-sm text-slate-500 mt-1">
                Create your first queue above to start issuing tokens.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue Name</TableHead>
                  <TableHead>Serving</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>Avg. Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q) => {
                  const servingNum = q.queue_state?.serving_number;
                  const waitingCount = q.queue_state?.waiting_numbers?.length ?? 0;
                  const avgMinutes = q.queue_state?.avg_service_minutes ?? q.default_service_minutes;

                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-semibold text-slate-900">
                        <Link
                          href={`/dashboard/queues/${q.id}`}
                          className="hover:text-[#0F766E] underline underline-offset-4 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] rounded-xs"
                        >
                          {q.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {servingNum !== null && servingNum !== undefined ? (
                          <span className="font-mono font-bold text-[#0F766E] text-base">
                            #{servingNum}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {waitingCount} {waitingCount === 1 ? 'person' : 'people'}
                        </span>
                      </TableCell>
                      <TableCell>{avgMinutes} min</TableCell>
                      <TableCell>
                        <StatusBadge status={q.is_active ? 'active' : 'paused'} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/dashboard/queues/${q.id}`}
                          className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0d645e] rounded-lg transition-colors min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2"
                          id={`open-queue-${q.id}`}
                        >
                          Open Controller
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
