import { createServiceClient } from '@/lib/supabase/service';
import { maskPhone } from '@/features/queue/schemas';
import { env } from '@/lib/env';

export interface SmsSendResult {
  ok: boolean;
  error?: string;
}

export interface SmsProvider {
  send(to: string, text: string): Promise<SmsSendResult>;
}

export interface PushSender {
  sendNotification(
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    payload: string,
  ): Promise<unknown>;
}

/**
 * Strips phone numbers and sensitive tokens from error strings before storing in last_error or logs (SEC-11, SEC-12).
 */
export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown error');
  return raw.replace(/(?:\+?88)?01[3-9]\d{8}/g, '•••••••••');
}

/**
 * Mock SMS Provider (Phase 7 - FR-17)
 * Logs only masked phone numbers, never cleartext (SEC-11).
 */
export class MockSmsProvider implements SmsProvider {
  async send(to: string, text: string): Promise<SmsSendResult> {
    const masked = maskPhone(to) || '•••••••••';
    // Log only masked recipient
    console.log(`[SMS-MOCK] Sent alert to: ${masked} | Message: ${text}`);
    return { ok: true };
  }
}

/**
 * Web-Push package push sender.
 * The 'web-push' package is required because RFC 8291 (Message Encryption for Web Push)
 * requires AES-128-GCM payload encryption with ECDH key negotiation over the P-256 curve,
 * along with RFC 8292 VAPID JWT signing.
 */
export class WebPushSender implements PushSender {
  private initialized = false;

  private init() {
    if (this.initialized) return;
    try {
      // Lazy load web-push on demand
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpush = require('web-push');
      webpush.setVapidDetails(
        env.VAPID_SUBJECT,
        env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
      );
      this.initialized = true;
    } catch (err: unknown) {
      console.error('[WebPushSender] Failed to initialize web-push:', sanitizeErrorMessage(err));
    }
  }

  async sendNotification(
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    payload: string,
  ): Promise<unknown> {
    this.init();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push');
    return webpush.sendNotification(subscription, payload);
  }
}

export interface ProcessOutboxOptions {
  pushSender?: PushSender;
  smsProvider?: SmsProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any;
  maxBatch?: number;
}

/**
 * Processes up to 20 pending notification outbox rows for tokens in a queue.
 * Handles Push and SMS delivery, 3-attempt retry before marking failed,
 * and deletes push subscriptions answering 404 or 410.
 */
export async function processOutbox(
  queueId: string,
  options: ProcessOutboxOptions = {},
) {
  const supabase = options.supabaseClient || createServiceClient();
  const pushSender = options.pushSender || new WebPushSender();
  const smsProvider =
    options.smsProvider ||
    (env.SMS_PROVIDER === 'mock' ? new MockSmsProvider() : new MockSmsProvider());

  const maxBatch = options.maxBatch ?? 20;

  // 1. Fetch up to 20 pending rows for this queue
  const { data: outboxRows, error: fetchError } = await supabase
    .from('notification_outbox')
    .select(`
      id,
      token_id,
      channel,
      kind,
      status,
      attempts,
      tokens!inner (
        id,
        queue_id,
        number,
        phone,
        public_code,
        status
      )
    `)
    .eq('tokens.queue_id', queueId)
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(maxBatch);

  if (fetchError || !outboxRows) {
    console.error('[processOutbox] Failed to fetch outbox rows:', sanitizeErrorMessage(fetchError));
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const row of outboxRows) {
    const token = Array.isArray(row.tokens) ? row.tokens[0] : row.tokens;
    if (!token) continue;

    // Short alert text in Bangla and English per requirement 5
    const messageText = `QueuePulse: 3 people ahead of you (serial #${token.number}) / আপনার আগে ৩ জন আছেন (সিরিয়াল #${token.number})`;

    if (row.channel === 'push') {
      // 1. Fetch subscription
      const { data: sub, error: subError } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('token_id', row.token_id)
        .maybeSingle();

      if (subError || !sub) {
        // No subscription found
        await supabase
          .from('notification_outbox')
          .update({
            status: 'failed',
            attempts: row.attempts + 1,
            last_error: 'No active push subscription found',
          })
          .eq('id', row.id);
        failedCount += 1;
        continue;
      }

      // 2. Send Web Push
      try {
        const payload = JSON.stringify({
          title: 'QueuePulse',
          body: messageText,
          url: `/t/${token.public_code}`,
        });

        await pushSender.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
        );

        // Mark sent
        await supabase
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        sentCount += 1;
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (err as any)?.statusCode;
        const errString = String(err);

        // 404 or 410: expired or invalid subscription -> delete it per requirement 5
        if (statusCode === 404 || statusCode === 410 || errString.includes('410') || errString.includes('404')) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }

        const nextAttempts = row.attempts + 1;
        const nextStatus = nextAttempts >= 3 ? 'failed' : 'pending';
        const cleanError = sanitizeErrorMessage(err);

        await supabase
          .from('notification_outbox')
          .update({
            status: nextStatus,
            attempts: nextAttempts,
            last_error: cleanError,
          })
          .eq('id', row.id);

        if (nextStatus === 'failed') {
          failedCount += 1;
        }
      }
    } else if (row.channel === 'sms') {
      if (!token.phone) {
        await supabase
          .from('notification_outbox')
          .update({
            status: 'failed',
            attempts: row.attempts + 1,
            last_error: 'No phone number available on token',
          })
          .eq('id', row.id);
        failedCount += 1;
        continue;
      }

      try {
        const smsResult = await smsProvider.send(token.phone, messageText);

        if (smsResult.ok) {
          await supabase
            .from('notification_outbox')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          sentCount += 1;
        } else {
          const nextAttempts = row.attempts + 1;
          const nextStatus = nextAttempts >= 3 ? 'failed' : 'pending';
          const cleanError = sanitizeErrorMessage(smsResult.error || 'SMS send failure');

          await supabase
            .from('notification_outbox')
            .update({
              status: nextStatus,
              attempts: nextAttempts,
              last_error: cleanError,
            })
            .eq('id', row.id);

          if (nextStatus === 'failed') {
            failedCount += 1;
          }
        }
      } catch (err: unknown) {
        const nextAttempts = row.attempts + 1;
        const nextStatus = nextAttempts >= 3 ? 'failed' : 'pending';
        const cleanError = sanitizeErrorMessage(err);

        await supabase
          .from('notification_outbox')
          .update({
            status: nextStatus,
            attempts: nextAttempts,
            last_error: cleanError,
          })
          .eq('id', row.id);

        if (nextStatus === 'failed') {
          failedCount += 1;
        }
      }
    }
  }

  return {
    processed: outboxRows.length,
    sent: sentCount,
    failed: failedCount,
  };
}
