'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface LiveQueueState {
  service_date: string;
  serving_number: number | null;
  last_issued: number;
  waiting_numbers: number[];
  avg_service_minutes: number;
  status: string;
  version: number;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export interface UseQueueLiveOptions {
  initialVersion?: number;
  onRefresh?: () => Promise<void> | void;
  onStateUpdate?: (payload: LiveQueueState) => void;
  pollIntervalMs?: number;
}

/**
 * Pure helper function to verify if an incoming broadcast version should be applied.
 * Enforces rule: applies a message ONLY when its version is higher than the current one.
 */
export function shouldApplyUpdate(incomingVersion: number, currentVersion: number): boolean {
  return typeof incomingVersion === 'number' && incomingVersion > currentVersion;
}

export function useQueueLive(
  queueId: string | null | undefined,
  options: UseQueueLiveOptions = {},
) {
  const { initialVersion = 0, onRefresh, onStateUpdate, pollIntervalMs = 10000 } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [latestState, setLatestState] = useState<LiveQueueState | null>(null);

  const currentVersionRef = useRef<number>(initialVersion);
  const onRefreshRef = useRef(onRefresh);
  const onStateUpdateRef = useRef(onStateUpdate);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep callback refs fresh without resetting effect
  useEffect(() => {
    onRefreshRef.current = onRefresh;
    onStateUpdateRef.current = onStateUpdate;
  });

  // Keep version ref up to date if initialVersion increases
  useEffect(() => {
    if (initialVersion > currentVersionRef.current) {
      currentVersionRef.current = initialVersion;
    }
  }, [initialVersion]);

  // Method to manually update current version (e.g., after onRefresh)
  const syncVersion = useCallback((version: number) => {
    if (version > currentVersionRef.current) {
      currentVersionRef.current = version;
    }
  }, []);

  useEffect(() => {
    if (!queueId) {
      setConnectionStatus('disconnected');
      return;
    }

    let isMounted = true;
    const supabase = createClient();

    const cleanupChannel = async () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (channelRef.current) {
        const chan = channelRef.current;
        channelRef.current = null;
        try {
          await supabase.removeChannel(chan);
        } catch {
          // Ignore removal errors during teardown
        }
      }
    };

    const subscribeToTopic = () => {
      if (!isMounted) return;

      setConnectionStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));

      // Topic: queue:<queue_id> with private: false for public anon broadcast
      const topic = `queue:${queueId}`;
      const channel = supabase.channel(topic, {
        config: {
          broadcast: { ack: false },
          private: false,
        },
      });

      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'queue_state_update' }, (response) => {
          if (!isMounted) return;
          const payload = response.payload as LiveQueueState;

          if (payload && shouldApplyUpdate(payload.version, currentVersionRef.current)) {
            currentVersionRef.current = payload.version;
            setLatestState(payload);
            setConnectionStatus('connected');
            if (onStateUpdateRef.current) {
              onStateUpdateRef.current(payload);
            }
          }
        })
        .subscribe(async (status) => {
          if (!isMounted) return;

          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
            retryCountRef.current = 0;
            // Load fresh state on SUBSCRIBED per requirement
            if (onRefreshRef.current) {
              await onRefreshRef.current();
            }
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            setConnectionStatus('reconnecting');
            scheduleRetry();
          }
        });
    };

    const scheduleRetry = () => {
      if (!isMounted || retryTimeoutRef.current) return;

      const backoffMs = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
      retryCountRef.current += 1;

      retryTimeoutRef.current = setTimeout(async () => {
        retryTimeoutRef.current = null;
        if (!isMounted) return;
        await cleanupChannel();
        subscribeToTopic();
      }, backoffMs);
    };

    // Initialize subscription
    subscribeToTopic();

    // 10-second polling fallback (DEC-04 & requirement)
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      if (onRefreshRef.current) {
        try {
          await onRefreshRef.current();
        } catch {
          // If polling fails, report reconnecting
          setConnectionStatus('reconnecting');
        }
      }
    }, pollIntervalMs);

    // Online/Offline network event listeners
    const handleOnline = () => {
      if (!isMounted) return;
      retryCountRef.current = 0;
      scheduleRetry();
    };

    const handleOffline = () => {
      if (!isMounted) return;
      setConnectionStatus('reconnecting');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanupChannel();
    };
  }, [queueId, pollIntervalMs]);

  return {
    connectionStatus,
    isReconnecting: connectionStatus === 'reconnecting',
    isConnected: connectionStatus === 'connected',
    latestState,
    currentVersion: currentVersionRef.current,
    syncVersion,
  };
}
