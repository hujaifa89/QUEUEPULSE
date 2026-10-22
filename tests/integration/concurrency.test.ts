import { createClient } from '@supabase/supabase-js';

// Jest integration test against local Supabase
// Requirements:
// 1. 20 parallel issue_token calls with different request_ids give unique numbers 1-20
// 2. 20 parallel calls with the same request_id return one token
// 3. 2 parallel advance_queue calls with the same expected_serving_token_id give exactly one success and one STALE_STATE

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role_key';

// Queue 1 from seed.sql (Org 1: Dhaka Central Clinic)
const QUEUE_ID = 'b0000000-0000-0000-0000-000000000001';

describe('Database Concurrency & Business Rules Integration', () => {
  let staffClient: ReturnType<typeof createClient>;
  let adminClient: ReturnType<typeof createClient>;

  beforeAll(async () => {
    // Admin / service client for setup and resets
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Authenticated staff client
    staffClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Sign in as Staff 1
    const { data: authData, error: authError } = await staffClient.auth.signInWithPassword({
      email: 'staff1@centralclinic.local',
      password: 'StaffPassword123!',
    });

    if (authError || !authData.session) {
      // In local dev without seed-users having run yet, fallback to setting auth context via admin if needed
      console.warn('Could not signInWithPassword, using admin context for integration test:', authError?.message);
    }
  });

  beforeEach(async () => {
    // Reset tokens and queue_state for QUEUE_ID to a pristine state for the test
    await adminClient.from('tokens').delete().eq('queue_id', QUEUE_ID);
    await adminClient.from('notification_outbox').delete();
    await adminClient
      .from('queue_state')
      .update({
        service_date: new Date().toISOString().split('T')[0],
        serving_number: null,
        last_issued: 0,
        waiting_numbers: [],
        avg_service_minutes: 10.0,
        status: 'active',
        version: 1,
      })
      .eq('queue_id', QUEUE_ID);
  });

  it('20 parallel issue_token calls with different request_ids give unique numbers 1-20', async () => {
    const promises = Array.from({ length: 20 }, (_, i) => {
      const requestId = crypto.randomUUID();
      const phone = `+88017000000${String(i + 1).padStart(2, '0')}`;
      return staffClient.rpc('issue_token', {
        p_queue_id: QUEUE_ID,
        p_phone: phone,
        p_request_id: requestId,
      });
    });

    const results = await Promise.all(promises);

    // Verify all succeeded
    results.forEach((res, idx) => {
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
      expect(res.data.length).toBeGreaterThan(0);
    });

    // Extract issued token numbers
    const issuedNumbers = results.map((r) => r.data[0].number);
    const uniqueNumbers = Array.from(new Set(issuedNumbers));

    // Assert all 20 are unique
    expect(uniqueNumbers.length).toBe(20);

    // Assert sequence is exactly 1 through 20
    uniqueNumbers.sort((a, b) => a - b);
    expect(uniqueNumbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // Assert queue_state reflects last_issued = 20 and all 20 in waiting_numbers
    const { data: stateData } = await adminClient
      .from('queue_state')
      .select('*')
      .eq('queue_id', QUEUE_ID)
      .single();

    expect(stateData.last_issued).toBe(20);
    expect(stateData.waiting_numbers.length).toBe(20);
  });

  it('20 parallel calls with the same request_id return one token', async () => {
    const sharedRequestId = crypto.randomUUID();
    const phone = '+8801711111111';

    const promises = Array.from({ length: 20 }, () =>
      staffClient.rpc('issue_token', {
        p_queue_id: QUEUE_ID,
        p_phone: phone,
        p_request_id: sharedRequestId,
      }),
    );

    const results = await Promise.all(promises);

    results.forEach((res) => {
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
    });

    // All 20 calls must return the same token number and code
    const firstTokenNumber = results[0].data[0].number;
    const firstPublicCode = results[0].data[0].public_code;

    expect(firstTokenNumber).toBe(1);

    results.forEach((res) => {
      expect(res.data[0].number).toBe(firstTokenNumber);
      expect(res.data[0].public_code).toBe(firstPublicCode);
    });

    // Verify only 1 token was inserted into the database
    const { data: tokensData } = await adminClient
      .from('tokens')
      .select('*')
      .eq('queue_id', QUEUE_ID);

    expect(tokensData?.length).toBe(1);

    // Verify last_issued is 1
    const { data: stateData } = await adminClient
      .from('queue_state')
      .select('*')
      .eq('queue_id', QUEUE_ID)
      .single();

    expect(stateData.last_issued).toBe(1);
  });

  it('2 parallel advance_queue calls with the same expected_serving_token_id give exactly one success and one STALE_STATE', async () => {
    // 1. Issue 3 tokens
    await staffClient.rpc('issue_token', {
      p_queue_id: QUEUE_ID,
      p_phone: '+8801700000001',
      p_request_id: crypto.randomUUID(),
    });
    await staffClient.rpc('issue_token', {
      p_queue_id: QUEUE_ID,
      p_phone: '+8801700000002',
      p_request_id: crypto.randomUUID(),
    });
    await staffClient.rpc('issue_token', {
      p_queue_id: QUEUE_ID,
      p_phone: '+8801700000003',
      p_request_id: crypto.randomUUID(),
    });

    // 2. Call Next with null expected_serving_token_id to begin serving token #1
    const { error: initialAdvanceError } = await staffClient.rpc('advance_queue', {
      p_queue_id: QUEUE_ID,
      p_action: 'next',
      p_expected_serving_token_id: null,
    });
    expect(initialAdvanceError).toBeNull();

    // 3. Find the ID of the currently serving token (#1)
    const { data: servingToken, error: tokenError } = await adminClient
      .from('tokens')
      .select('id, number')
      .eq('queue_id', QUEUE_ID)
      .eq('status', 'serving')
      .single();

    expect(tokenError).toBeNull();
    expect(servingToken).toBeDefined();
    expect(servingToken.number).toBe(1);

    const expectedServingTokenId = servingToken.id;

    // 4. Concurrently trigger 2 advance_queue calls with the SAME expected_serving_token_id
    const [result1, result2] = await Promise.allSettled([
      staffClient.rpc('advance_queue', {
        p_queue_id: QUEUE_ID,
        p_action: 'next',
        p_expected_serving_token_id: expectedServingTokenId,
      }),
      staffClient.rpc('advance_queue', {
        p_queue_id: QUEUE_ID,
        p_action: 'next',
        p_expected_serving_token_id: expectedServingTokenId,
      }),
    ]);

    // One must succeed, one must fail with STALE_STATE
    const successfulResults = [result1, result2].filter(
      (r) => r.status === 'fulfilled' && !r.value.error,
    );
    const failedResults = [result1, result2].filter(
      (r) =>
        (r.status === 'fulfilled' && r.value.error?.message?.includes('STALE_STATE')) ||
        (r.status === 'rejected' && String(r.reason).includes('STALE_STATE')),
    );

    expect(successfulResults.length).toBe(1);
    expect(failedResults.length).toBe(1);
  });
});
