'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Banner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  LanguageSwitcher,
} from '@/components/ui';
import { t, type Locale } from '@/i18n';
import type { ReportSummary } from '@/features/reports/schemas';

interface QueueItem {
  id: string;
  name: string;
}

export default function ReportsPage() {
  const router = useRouter();

  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>('');
  const [dateRangePreset, setDateRangePreset] = useState<string>('today');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const [locale, setLocale] = useState<Locale>('bn');
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetchingReport, setIsFetchingReport] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string>('');

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

  // Helper to format date as YYYY-MM-DD
  const formatIsoDate = (d: Date) => d.toISOString().split('T')[0];

  // Helper to get dates based on preset
  const applyPreset = useCallback((preset: string) => {
    const today = new Date();
    const todayStr = formatIsoDate(today);

    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatIsoDate(yesterday);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === '7days') {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 6);
      setFromDate(formatIsoDate(past7));
      setToDate(todayStr);
    } else if (preset === '30days') {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 29);
      setFromDate(formatIsoDate(past30));
      setToDate(todayStr);
    }
  }, []);

  // 1. Initial Load: Fetch Queues & set default dates
  useEffect(() => {
    applyPreset('today');

    async function loadQueues() {
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
          setErrorBanner('Failed to load queues list');
          return;
        }
        const data = await res.json();
        const list: QueueItem[] = data.queues || [];
        setQueues(list);
        if (list.length > 0) {
          setSelectedQueueId(list[0].id);
        }
      } catch {
        setErrorBanner('Network error loading queues');
      } finally {
        setIsLoading(false);
      }
    }

    loadQueues();
  }, [applyPreset, router]);

  // 2. Fetch Report Data
  const fetchReport = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setIsFetchingReport(true);
    setErrorBanner('');

    try {
      const params = new URLSearchParams();
      if (selectedQueueId) {
        params.set('queue_id', selectedQueueId);
      }
      params.set('from', fromDate);
      params.set('to', toDate);

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.status === 403) {
        router.push('/403');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error?.message || 'Failed to generate report');
        return;
      }

      setReport(data.report);
    } catch {
      setErrorBanner('Network error: Unable to load report.');
    } finally {
      setIsFetchingReport(false);
    }
  }, [selectedQueueId, fromDate, toDate, router]);

  // Fetch report whenever queueId or dates change
  useEffect(() => {
    if (!isLoading && fromDate && toDate) {
      fetchReport();
    }
  }, [isLoading, selectedQueueId, fromDate, toDate, fetchReport]);

  const handlePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    if (preset !== 'custom') {
      applyPreset(preset);
    }
  };

  const handleExportCsv = () => {
    if (!fromDate || !toDate) return;
    const params = new URLSearchParams();
    if (selectedQueueId) {
      params.set('queue_id', selectedQueueId);
    }
    params.set('from', fromDate);
    params.set('to', toDate);
    window.location.href = `/api/reports/export?${params.toString()}`;
  };

  const formatSecondsText = (sec: number | null) => {
    if (sec === null || sec === undefined) return '—';
    if (sec < 60) return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m} min`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="h-10 w-10 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-600 font-medium text-sm">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 text-sm font-semibold min-h-[44px] px-2 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
            >
              &larr; Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-bold text-slate-900 text-lg">Queue Reports &amp; Analytics</span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
            <Button
              id="export-csv-button"
              variant="outline"
              onClick={handleExportCsv}
              disabled={isFetchingReport || !report || report.total_issued === 0}
              className="min-h-[44px] text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              &darr; {locale === 'bn' ? 'সিএসভি ডাউনলোড' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {errorBanner && (
          <Banner variant="danger" onClose={() => setErrorBanner('')}>
            {errorBanner}
          </Banner>
        )}

        {/* Filter Controls Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Queue Selector */}
          <div className="flex-1 max-w-xs">
            <label htmlFor="report-queue-select" className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Select Queue
            </label>
            <select
              id="report-queue-select"
              value={selectedQueueId}
              onChange={(e) => setSelectedQueueId(e.target.value)}
              className="w-full h-11 px-3 border border-slate-300 rounded-xl bg-white text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Presets */}
          <div>
            <span className="block text-xs font-bold text-slate-600 uppercase mb-1">Date Range</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7days', label: 'Last 7 Days' },
                { id: '30days', label: 'Last 30 Days' },
                { id: 'custom', label: 'Custom' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors min-h-[36px] ${
                    dateRangePreset === p.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Pickers */}
          {dateRangePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <div>
                <label htmlFor="custom-from-date" className="block text-[11px] font-bold text-slate-500 uppercase mb-0.5">
                  From
                </label>
                <input
                  id="custom-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10 px-2.5 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>
              <span className="text-slate-400 mt-4">&ndash;</span>
              <div>
                <label htmlFor="custom-to-date" className="block text-[11px] font-bold text-slate-500 uppercase mb-0.5">
                  To
                </label>
                <input
                  id="custom-to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10 px-2.5 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>
            </div>
          )}
        </div>

        {/* Loading Spinner for Report Refresh */}
        {isFetchingReport && (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <div className="h-8 w-8 border-3 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium mt-3">Compiling queue metrics...</p>
          </div>
        )}

        {/* Empty State: No data for this period */}
        {!isFetchingReport && report && report.total_issued === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <div className="h-12 w-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              0
            </div>
            <h2 className="text-lg font-bold text-slate-900">No data for this period</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There were no tokens issued or served in this queue during the selected date range ({fromDate} to {toDate}).
            </p>
          </div>
        )}

        {/* Report Content: Metrics, Daily Table, Hourly Peak */}
        {!isFetchingReport && report && report.total_issued > 0 && (
          <>
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-slate-400">Total Issued</span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">
                  {report.total_issued}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-emerald-600">Completed</span>
                <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                  {report.total_completed}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-amber-600">Skipped</span>
                <div className="text-2xl font-black text-amber-600 font-mono mt-1">
                  {report.total_skipped}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-red-600">Cancelled</span>
                <div className="text-2xl font-black text-red-600 font-mono mt-1">
                  {report.total_cancelled}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-slate-500">Expired</span>
                <div className="text-2xl font-black text-slate-600 font-mono mt-1">
                  {report.total_expired}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-teal-700">Avg Wait</span>
                <div className="text-xl font-black text-teal-800 font-mono mt-2">
                  {formatSecondsText(report.avg_wait_seconds)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] font-bold uppercase text-teal-700">Avg Service</span>
                <div className="text-xl font-black text-teal-800 font-mono mt-2">
                  {formatSecondsText(report.avg_service_seconds)}
                </div>
              </div>
            </div>

            {/* Daily Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Daily Performance Table</h2>
                  <p className="text-xs text-slate-500">
                    Day-by-day counts and service durations (Asia/Dhaka dates).
                  </p>
                </div>
                <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-md">
                  {report.daily.length} Days
                </span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Skipped</TableHead>
                    <TableHead>Cancelled</TableHead>
                    <TableHead>Expired</TableHead>
                    <TableHead>Avg Wait</TableHead>
                    <TableHead>Avg Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.daily.map((day) => (
                    <TableRow key={day.date}>
                      <TableCell className="font-mono font-bold text-slate-800">
                        {day.date}
                      </TableCell>
                      <TableCell className="font-mono">{day.issued}</TableCell>
                      <TableCell className="font-mono text-emerald-600 font-semibold">{day.completed}</TableCell>
                      <TableCell className="font-mono text-amber-600">{day.skipped}</TableCell>
                      <TableCell className="font-mono text-red-600">{day.cancelled}</TableCell>
                      <TableCell className="font-mono text-slate-400">{day.expired}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">
                        {formatSecondsText(day.avg_wait_seconds)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">
                        {formatSecondsText(day.avg_service_seconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Hourly Peak Distribution (F-12) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Hourly Peak Traffic (Asia/Dhaka)</h2>
                <p className="text-xs text-slate-500">
                  Distribution of tokens issued across hours of the day (00:00 to 23:00).
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2 pt-2">
                {report.hourly.map((h) => {
                  const maxCount = Math.max(...report.hourly.map((x) => x.count), 1);
                  const heightPercent = Math.max(Math.round((h.count / maxCount) * 100), 8);
                  return (
                    <div
                      key={h.hour}
                      className="flex flex-col items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {String(h.hour).padStart(2, '0')}:00
                      </span>
                      <div className="h-16 w-full flex items-end justify-center py-1">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-4 rounded-sm transition-all ${
                            h.count > 0 ? 'bg-[#0F766E]' : 'bg-slate-200'
                          }`}
                        />
                      </div>
                      <span className="text-xs font-mono font-black text-slate-800">
                        {h.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
