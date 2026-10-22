'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  TextField,
  Banner,
  StatusBadge,
  BigNumber,
  ConfirmDialog,
  QRCard,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  LanguageSwitcher,
} from '@/components/ui';
import { useQueueLive } from '@/features/live';
import { t, type Locale } from '@/i18n';

interface QueueState {
  service_date: string;
  serving_number: number | null;
  last_issued: number;
  waiting_numbers: number[];
  avg_service_minutes: number;
  status: string;
  version: number;
  updated_at: string;
}

interface ServingToken {
  id: string;
  number: number;
  status: string;
  called_at: string | null;
  phone: string | null;
  public_code: string;
}

interface WaitingToken {
  id: string;
  number: number;
  status: string;
  issued_at: string;
  phone: string | null;
  public_code: string;
}

interface SkippedToken {
  id: string;
  number: number;
  status: string;
  phone: string | null;
  public_code: string;
  can_recall: boolean;
}

interface QueueCounts {
  total: number;
  waiting: number;
  serving: number;
  completed: number;
  skipped: number;
  cancelled: number;
}

interface QueueDetails {
  id: string;
  org_id: string;
  name: string;
  default_service_minutes: number;
  is_active: boolean;
}

interface IssuedTokenSlip {
  queueName: string;
  tokenNumber: number;
  date: string;
  publicCode: string;
}

export default function QueueControllerPage() {
  const params = useParams();
  const router = useRouter();
  const queueId = params?.id as string;

  const [queue, setQueue] = useState<QueueDetails | null>(null);
  const [state, setState] = useState<QueueState | null>(null);
  const [servingToken, setServingToken] = useState<ServingToken | null>(null);
  const [nextWaiting, setNextWaiting] = useState<WaitingToken[]>([]);
  const [skippedTokens, setSkippedTokens] = useState<SkippedToken[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({
    total: 0,
    waiting: 0,
    serving: 0,
    completed: 0,
    skipped: 0,
    cancelled: 0,
  });

  const [locale, setLocale] = useState<Locale>('bn');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [recallingTokenId, setRecallingTokenId] = useState<string | null>(null);

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

  // Banners & Notifications
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [staleStateBanner, setStaleStateBanner] = useState('');
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);

  // Issue Token Form State
  const [visitorPhone, setVisitorPhone] = useState('');
  const [issueError, setIssueError] = useState('');
  const pendingRequestIdRef = useRef<string | null>(null);

  // Token Slip Modal State
  const [slipData, setSlipData] = useState<IssuedTokenSlip | null>(null);

  // Cancel Confirmation Dialog State
  const [tokenToCancel, setTokenToCancel] = useState<WaitingToken | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch Dashboard Data
  const fetchDashboardData = useCallback(async () => {
    if (!queueId) return;

    try {
      const res = await fetch(`/api/queues/${queueId}/dashboard`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.status === 403) {
        router.push('/403');
        return;
      }
      if (res.status === 404) {
        router.push('/dashboard');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorBanner(data.error?.message || 'Failed to load queue controller');
        return;
      }

      const data = await res.json();
      setQueue(data.queue);
      setState(data.state);
      setServingToken(data.serving);
      setNextWaiting(data.next_waiting || []);
      setSkippedTokens(data.skipped || []);
      setCounts(data.counts);
    } catch {
      setErrorBanner('Network error: Unable to load controller data.');
    } finally {
      setIsLoading(false);
    }
  }, [queueId, router]);

  const { isReconnecting, syncVersion } = useQueueLive(queueId, {
    initialVersion: state?.version ?? 0,
    onRefresh: fetchDashboardData,
    onStateUpdate: async () => {
      await fetchDashboardData();
    },
    pollIntervalMs: 10000,
  });

  useEffect(() => {
    fetchDashboardData();

    const onFocus = () => fetchDashboardData();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchDashboardData]);

  // Advance Queue (Next or Skip)
  const handleAdvance = async (action: 'next' | 'skip') => {
    setErrorBanner('');
    setStaleStateBanner('');
    setSuccessBanner('');
    setRetryAction(null);
    setIsAdvancing(true);

    const expectedServingTokenId = servingToken ? servingToken.id : null;

    const performRequest = async () => {
      setIsAdvancing(true);
      setErrorBanner('');
      setRetryAction(null);

      try {
        const res = await fetch(`/api/queues/${queueId}/advance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            expected_serving_token_id: expectedServingTokenId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 409 && data.error?.code === 'STALE_STATE') {
          setStaleStateBanner('Someone already advanced the queue');
          if (data.state) {
            setState(data.state);
          }
          await fetchDashboardData();
          return;
        }

        if (!res.ok) {
          setErrorBanner(data.error?.message || `Failed to ${action} queue`);
          await fetchDashboardData();
          return;
        }

        setSuccessBanner(
          action === 'next' ? 'Advanced to next token' : 'Current token skipped',
        );
        await fetchDashboardData();
      } catch {
        setErrorBanner('Not saved');
        setRetryAction(() => performRequest);
      } finally {
        setIsAdvancing(false);
      }
    };

    await performRequest();
  };

  // Issue Token
  const handleIssueToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssueError('');
    setErrorBanner('');
    setSuccessBanner('');
    setStaleStateBanner('');
    setRetryAction(null);

    // Reuse requestId on retry, or generate once per new submission
    if (!pendingRequestIdRef.current) {
      pendingRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = pendingRequestIdRef.current;
    const phoneInput = visitorPhone.trim() || undefined;

    const performIssue = async () => {
      setIsIssuing(true);
      setErrorBanner('');
      setRetryAction(null);

      try {
        const res = await fetch(`/api/queues/${queueId}/tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: phoneInput,
            request_id: requestId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setIssueError(data.error?.message || 'Failed to issue token');
          return;
        }

        // Token successfully issued: reset input and pending requestId
        pendingRequestIdRef.current = null;
        setVisitorPhone('');

        // Open Token Slip Modal
        if (data.token) {
          setSlipData({
            queueName: data.token.queue_name || queue?.name || 'Queue',
            tokenNumber: data.token.number,
            date: data.token.service_date,
            publicCode: data.token.public_code,
          });
        }

        setSuccessBanner(`Token #${data.token?.number} issued successfully!`);
        await fetchDashboardData();
      } catch {
        setErrorBanner('Not saved');
        setRetryAction(() => performIssue);
      } finally {
        setIsIssuing(false);
      }
    };

    await performIssue();
  };

  // Cancel Waiting Token
  const handleConfirmCancel = async () => {
    if (!tokenToCancel) return;

    setIsCancelling(true);
    setErrorBanner('');
    setSuccessBanner('');

    try {
      const res = await fetch(`/api/queues/${queueId}/tokens/${tokenToCancel.id}/cancel`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorBanner(data.error?.message || 'Failed to cancel token');
      } else {
        setSuccessBanner(`Token #${tokenToCancel.number} has been cancelled`);
        await fetchDashboardData();
      }
    } catch {
      setErrorBanner('Network error: Unable to cancel token.');
    } finally {
      setIsCancelling(false);
      setTokenToCancel(null);
    }
  };

  // Pause / Resume Queue (F-11)
  const handleTogglePause = async () => {
    if (!state) return;
    setIsPausing(true);
    setErrorBanner('');
    setSuccessBanner('');

    const isCurrentlyPaused = state.status === 'paused';
    const endpoint = isCurrentlyPaused
      ? `/api/queues/${queueId}/resume`
      : `/api/queues/${queueId}/pause`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorBanner(data.error?.message || 'Failed to update queue pause state');
        return;
      }

      setSuccessBanner(
        isCurrentlyPaused
          ? 'Queue resumed successfully'
          : 'Queue paused. Next and issuing are blocked.',
      );
      await fetchDashboardData();
    } catch {
      setErrorBanner('Network error: Failed to toggle pause state.');
    } finally {
      setIsPausing(false);
    }
  };

  // Recall Skipped Token (F-11)
  const handleRecallToken = async (tokenId: string, tokenNumber: number) => {
    setRecallingTokenId(tokenId);
    setErrorBanner('');
    setSuccessBanner('');

    try {
      const res = await fetch(`/api/queues/${queueId}/tokens/${tokenId}/recall`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorBanner(data.error?.message || `Failed to recall Token #${tokenNumber}`);
        return;
      }

      setSuccessBanner(`Token #${tokenNumber} recalled to waiting line! It will be called next.`);
      await fetchDashboardData();
    } catch {
      setErrorBanner('Network error: Unable to recall token.');
    } finally {
      setRecallingTokenId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="h-10 w-10 border-4 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-600 font-medium text-sm">Loading queue controller...</p>
      </div>
    );
  }

  const servingNumber = state?.serving_number ?? servingToken?.number ?? null;
  const isPaused = state?.status === 'paused';
  const isSkipDisabled = isAdvancing || !servingToken || isPaused;
  const isNextDisabled = isAdvancing || isPaused;
  const isIssueDisabled = isIssuing || isPaused;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header & Breadcrumb */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 text-sm font-semibold min-h-[44px] px-2 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0F766E]"
            >
              &larr; Back to Queues
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-md">
              {queue?.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
            {isReconnecting && (
              <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 font-semibold px-2.5 py-1 rounded-md animate-pulse">
                {t(locale, 'reconnecting')}
              </span>
            )}
            <Button
              id="toggle-pause-queue-button"
              variant={isPaused ? 'primary' : 'outline'}
              onClick={handleTogglePause}
              isLoading={isPausing}
              disabled={isPausing}
              className={`min-h-[38px] text-xs font-bold px-3 ${
                isPaused
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isPaused ? (locale === 'bn' ? 'পুনরায় চালু' : 'Resume Queue') : (locale === 'bn' ? 'সিরিয়াল স্থগিত' : 'Pause Queue')}
            </Button>
            <StatusBadge status={isPaused ? 'paused' : queue?.is_active ? 'active' : 'paused'} />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6 print:hidden">
        {/* Paused Queue Notice (F-11) */}
        {isPaused && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-xl font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
              <span>Queue is currently PAUSED. Calling Next and issuing new tokens are disabled.</span>
            </div>
            <Button
              variant="primary"
              onClick={handleTogglePause}
              isLoading={isPausing}
              disabled={isPausing}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs min-h-[38px] px-3 font-bold"
            >
              Resume Queue Now
            </Button>
          </div>
        )}
        {/* Alerts and Banners */}
        {staleStateBanner && (
          <Banner variant="danger" onClose={() => setStaleStateBanner('')}>
            {staleStateBanner}
          </Banner>
        )}

        {errorBanner && (
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{errorBanner}</span>
            </div>
            {retryAction && (
              <Button
                variant="primary"
                onClick={retryAction}
                className="min-h-[38px] text-xs px-3 bg-red-700 hover:bg-red-800"
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {successBanner && (
          <Banner variant="success" onClose={() => setSuccessBanner('')}>
            {successBanner}
          </Banner>
        )}

        {/* Top Section: Controller Big Display & Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Big Serving Display & Action Buttons */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">{queue?.name}</h1>
                <p className="text-xs text-slate-500">Live Counter Controller</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-semibold block uppercase">Service Date</span>
                <span className="text-sm font-mono font-medium text-slate-700">{state?.service_date}</span>
              </div>
            </div>

            {/* Serving Big Number */}
            <div className="my-4">
              <BigNumber
                label="Now Serving"
                value={servingNumber !== null ? `#${servingNumber}` : '—'}
                subtitle={
                  servingToken?.phone
                    ? `Visitor Phone: ${servingToken.phone}`
                    : servingNumber !== null
                      ? 'No phone attached'
                      : 'Counter is currently idle'
                }
                ariaLive="polite"
              />
            </div>

            {/* Next & Skip Action Buttons */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Button
                id="advance-skip-button"
                variant="outline"
                onClick={() => handleAdvance('skip')}
                disabled={isSkipDisabled}
                isLoading={isAdvancing}
                className="min-h-[52px] text-base font-bold text-slate-700 border-slate-300 hover:bg-slate-50"
              >
                Skip
              </Button>

              <Button
                id="advance-next-button"
                variant="primary"
                onClick={() => handleAdvance('next')}
                disabled={isNextDisabled}
                isLoading={isAdvancing}
                className="min-h-[52px] text-base font-bold bg-[#0F766E] hover:bg-[#0d645e]"
              >
                Next &rarr;
              </Button>
            </div>
          </div>

          {/* Issue Token Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Issue New Token</h2>
              <p className="text-xs text-slate-500 mb-4">
                Enter visitor phone (optional) to send SMS notifications and generate a token slip.
              </p>

              <form onSubmit={handleIssueToken} className="space-y-4">
                {issueError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                    {issueError}
                  </div>
                )}

                <TextField
                  id="issue-visitor-phone"
                  label="Visitor Phone (Optional)"
                  placeholder="01XXXXXXXXX or +8801XXXXXXXXX"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                  hint="Accepts Bangladeshi mobile numbers with operator 013-019"
                />

                <Button
                  id="issue-token-submit"
                  type="submit"
                  variant="primary"
                  isLoading={isIssuing}
                  disabled={isIssueDisabled}
                  className="w-full min-h-[46px] font-bold mt-2"
                >
                  {isPaused ? 'Queue is Paused' : 'Issue Token & Print'}
                </Button>
                {isPaused && (
                  <p className="text-[11px] text-amber-700 font-semibold text-center mt-1">
                    Resume queue above to issue new tokens.
                  </p>
                )}
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Avg Service Time:</span>
              <span className="font-bold text-slate-800 font-mono">
                {state?.avg_service_minutes ?? queue?.default_service_minutes} min
              </span>
            </div>
          </div>
        </div>

        {/* Counts Row */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-slate-400">Total Issued</span>
            <div className="text-2xl font-black text-slate-800 font-mono mt-1">{counts.total}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-amber-600">Waiting</span>
            <div className="text-2xl font-black text-amber-600 font-mono mt-1">{counts.waiting}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-teal-600">Serving</span>
            <div className="text-2xl font-black text-teal-600 font-mono mt-1">{counts.serving}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-emerald-600">Completed</span>
            <div className="text-2xl font-black text-emerald-600 font-mono mt-1">{counts.completed}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Skipped</span>
            <div className="text-2xl font-black text-slate-600 font-mono mt-1">{counts.skipped}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <span className="text-[11px] font-semibold uppercase text-red-500">Cancelled</span>
            <div className="text-2xl font-black text-red-600 font-mono mt-1">{counts.cancelled}</div>
          </div>
        </div>

        {/* Next 5 Waiting Tokens List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Next Waiting Tokens</h2>
              <p className="text-xs text-slate-500">Next 5 tokens in line awaiting their turn.</p>
            </div>
            <span className="text-xs bg-amber-50 text-amber-800 font-bold px-2.5 py-1 rounded-md">
              {nextWaiting.length} In Queue View
            </span>
          </div>

          {nextWaiting.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-sm font-semibold text-slate-700">No tokens waiting</p>
              <p className="text-xs text-slate-400 mt-0.5">Use the form above to issue tokens.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial #</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Issued At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nextWaiting.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-mono font-bold text-slate-900 text-base">
                      #{token.number}
                    </TableCell>
                    <TableCell className="font-mono text-slate-600">
                      {token.phone || <span className="text-slate-300">None</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(token.issued_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={token.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        id={`cancel-token-${token.number}`}
                        variant="danger"
                        onClick={() => setTokenToCancel(token)}
                        className="min-h-[38px] text-xs px-3"
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Skipped Tokens Section with Recall Action (F-11, DEC-17) */}
        {skippedTokens.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Skipped Tokens</h2>
                <p className="text-xs text-slate-500">
                  Skipped tokens can be recalled once (DEC-17). Recalled tokens return to waiting line and are called next.
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-md">
                {skippedTokens.length} Skipped
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial #</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skippedTokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-mono font-bold text-slate-900 text-base">
                      #{token.number}
                    </TableCell>
                    <TableCell className="font-mono text-slate-600">
                      {token.phone || <span className="text-slate-300">None</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={token.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {token.can_recall ? (
                        <Button
                          id={`recall-token-${token.number}`}
                          variant="outline"
                          onClick={() => handleRecallToken(token.id, token.number)}
                          isLoading={recallingTokenId === token.id}
                          disabled={recallingTokenId === token.id || isPaused}
                          className="min-h-[38px] text-xs px-3 border-teal-600 text-teal-700 hover:bg-teal-50 font-bold"
                        >
                          Recall &rarr;
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold italic">
                          Already Recalled
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* Token Slip Modal */}
      {slipData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <QRCard
              queueName={slipData.queueName}
              tokenNumber={slipData.tokenNumber}
              date={slipData.date}
              publicCode={slipData.publicCode}
              onClose={() => setSlipData(null)}
            />
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(tokenToCancel)}
        title={`Cancel Token #${tokenToCancel?.number}?`}
        message="Are you sure you want to cancel this waiting token? This token will be removed from the queue and cannot be called."
        confirmLabel="Cancel Token"
        cancelLabel="Keep Waiting"
        variant="danger"
        isLoading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setTokenToCancel(null)}
      />
    </div>
  );
}
