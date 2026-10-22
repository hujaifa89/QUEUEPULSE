import {
  processOutbox,
  sanitizeErrorMessage,
  MockSmsProvider,
  type PushSender,
  type SmsProvider,
} from '@/features/notifications/outbox';

describe('Sanitize Error Message (SEC-11, SEC-12)', () => {
  it('strips Bangladeshi phone numbers from error strings', () => {
    const errorWithPhone = new Error('Gateway failed for +8801712345678: timeout');
    const sanitized = sanitizeErrorMessage(errorWithPhone);
    expect(sanitized).not.toContain('+8801712345678');
    expect(sanitized).toContain('•••••••••');

    const errorLocalPhone = 'Delivery to 01912345678 rejected';
    expect(sanitizeErrorMessage(errorLocalPhone)).not.toContain('01912345678');
    expect(sanitizeErrorMessage(errorLocalPhone)).toContain('•••••••••');
  });
});

describe('MockSmsProvider Logging (SEC-11)', () => {
  it('logs only masked phone numbers, never cleartext', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const provider = new MockSmsProvider();

    const res = await provider.send('+8801712345678', 'Queue alert');
    expect(res.ok).toBe(true);

    expect(consoleSpy).toHaveBeenCalled();
    const loggedOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(loggedOutput).not.toContain('+8801712345678');
    expect(loggedOutput).toContain('•••••••••678');

    consoleSpy.mockRestore();
  });
});

describe('processOutbox Core Logic', () => {
  const queueId = 'b0000000-0000-0000-0000-000000000001';

  function createMockSupabase(outboxRows: any[]) {
    const updates: any[] = [];
    const deletes: any[] = [];

    const mockClient = {
      from: (table: string) => {
        if (table === 'notification_outbox') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation((max: number) => {
              return Promise.resolve({
                data: outboxRows.slice(0, max),
                error: null,
              });
            }),
            update: jest.fn().mockImplementation((payload: any) => ({
              eq: jest.fn().mockImplementation((_field: string, id: number) => {
                updates.push({ id, ...payload });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }

        if (table === 'push_subscriptions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((_field: string, _val: any) => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  endpoint: 'https://push.example.com/sub/123',
                  p256dh: 'fake-p256dh',
                  auth: 'fake-auth',
                },
                error: null,
              }),
            })),
            delete: jest.fn().mockImplementation(() => ({
              eq: jest.fn().mockImplementation((_field: string, endpoint: string) => {
                deletes.push({ endpoint });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }

        return {} as any;
      },
      updates,
      deletes,
    };

    return mockClient;
  }

  it('successfully sends push notification and marks outbox row sent', async () => {
    const rows = [
      {
        id: 1,
        token_id: 't-1',
        channel: 'push',
        kind: 'near_turn',
        status: 'pending',
        attempts: 0,
        tokens: {
          id: 't-1',
          queue_id: queueId,
          number: 5,
          phone: null,
          public_code: 'code-123',
          status: 'waiting',
        },
      },
    ];

    const mockSupabase = createMockSupabase(rows);
    const fakePushSender: PushSender = {
      sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
    };

    const res = await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      pushSender: fakePushSender,
    });

    expect(res.processed).toBe(1);
    expect(res.sent).toBe(1);
    expect(fakePushSender.sendNotification).toHaveBeenCalledTimes(1);

    expect(mockSupabase.updates).toHaveLength(1);
    expect(mockSupabase.updates[0].status).toBe('sent');
    expect(mockSupabase.updates[0].sent_at).toBeDefined();
  });

  it('increments attempts on failure and retries when attempts < 3', async () => {
    const rows = [
      {
        id: 2,
        token_id: 't-2',
        channel: 'push',
        kind: 'near_turn',
        status: 'pending',
        attempts: 1,
        tokens: {
          id: 't-2',
          queue_id: queueId,
          number: 6,
          phone: null,
          public_code: 'code-456',
          status: 'waiting',
        },
      },
    ];

    const mockSupabase = createMockSupabase(rows);
    const failingPushSender: PushSender = {
      sendNotification: jest.fn().mockRejectedValue(new Error('Push endpoint temporarily down')),
    };

    const res = await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      pushSender: failingPushSender,
    });

    expect(res.processed).toBe(1);
    expect(res.sent).toBe(0);
    expect(mockSupabase.updates).toHaveLength(1);
    expect(mockSupabase.updates[0].attempts).toBe(2);
    expect(mockSupabase.updates[0].status).toBe('pending');
  });

  it('marks row as failed on third attempt failure', async () => {
    const rows = [
      {
        id: 3,
        token_id: 't-3',
        channel: 'push',
        kind: 'near_turn',
        status: 'pending',
        attempts: 2,
        tokens: {
          id: 't-3',
          queue_id: queueId,
          number: 7,
          phone: null,
          public_code: 'code-789',
          status: 'waiting',
        },
      },
    ];

    const mockSupabase = createMockSupabase(rows);
    const failingPushSender: PushSender = {
      sendNotification: jest.fn().mockRejectedValue(new Error('Fatal delivery error')),
    };

    const res = await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      pushSender: failingPushSender,
    });

    expect(res.processed).toBe(1);
    expect(res.failed).toBe(1);
    expect(mockSupabase.updates[0].attempts).toBe(3);
    expect(mockSupabase.updates[0].status).toBe('failed');
  });

  it('deletes push subscription when receiving 404 or 410 Gone', async () => {
    const rows = [
      {
        id: 4,
        token_id: 't-4',
        channel: 'push',
        kind: 'near_turn',
        status: 'pending',
        attempts: 0,
        tokens: {
          id: 't-4',
          queue_id: queueId,
          number: 8,
          phone: null,
          public_code: 'code-gone',
          status: 'waiting',
        },
      },
    ];

    const mockSupabase = createMockSupabase(rows);
    const gonePushSender: PushSender = {
      sendNotification: jest.fn().mockRejectedValue({ statusCode: 410, message: 'Subscription Gone' }),
    };

    await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      pushSender: gonePushSender,
    });

    expect(mockSupabase.deletes).toHaveLength(1);
    expect(mockSupabase.deletes[0].endpoint).toBe('https://push.example.com/sub/123');
  });

  it('limits processing to at most 20 rows per run', async () => {
    // Generate 25 rows
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      token_id: `t-${i}`,
      channel: 'push',
      kind: 'near_turn',
      status: 'pending',
      attempts: 0,
      tokens: {
        id: `t-${i}`,
        queue_id: queueId,
        number: i + 1,
        phone: null,
        public_code: `code-${i}`,
        status: 'waiting',
      },
    }));

    const mockSupabase = createMockSupabase(rows);
    const fakePushSender: PushSender = {
      sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
    };

    const res = await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      pushSender: fakePushSender,
    });

    // Exactly 20 processed
    expect(res.processed).toBe(20);
    expect(res.sent).toBe(20);
  });

  it('handles SMS provider delivery and never logs raw phone number', async () => {
    const rows = [
      {
        id: 5,
        token_id: 't-sms',
        channel: 'sms',
        kind: 'near_turn',
        status: 'pending',
        attempts: 0,
        tokens: {
          id: 't-sms',
          queue_id: queueId,
          number: 10,
          phone: '+8801712345678',
          public_code: 'code-sms',
          status: 'waiting',
        },
      },
    ];

    const mockSupabase = createMockSupabase(rows);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const fakeSmsProvider: SmsProvider = {
      send: jest.fn().mockResolvedValue({ ok: true }),
    };

    const res = await processOutbox(queueId, {
      supabaseClient: mockSupabase,
      smsProvider: fakeSmsProvider,
    });

    expect(res.processed).toBe(1);
    expect(res.sent).toBe(1);
    expect(fakeSmsProvider.send).toHaveBeenCalledWith('+8801712345678', expect.any(String));

    // Verify console logs never leak the raw phone number
    const allLogs = consoleSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain('+8801712345678');

    consoleSpy.mockRestore();
  });
});
