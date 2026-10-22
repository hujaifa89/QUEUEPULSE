import { createClient } from '@supabase/supabase-js';

// Realtime Spike: Proves anonymous clients receive Broadcast from Database on public topics
// Architecture Rule 5 & DEC-03 Spike
// Phase 3: Confirms a broadcast arrives after advance_queue

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role_key';

// Queue 1 from seed.sql (Org 1: Dhaka Central Clinic)
const TEST_QUEUE_ID = 'b0000000-0000-0000-0000-000000000001';
const TOPIC = `queue:${TEST_QUEUE_ID}`;

async function runSpike() {
  console.log(`Starting Realtime Spike on topic: "${TOPIC}"...`);

  // 1. Create anonymous client (NO auth token, only public anon key)
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // 2. Staff client for authenticated advance_queue call
  const staffClient = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Authenticate as staff member
  const { data: authData, error: authError } = await staffClient.auth.signInWithPassword({
    email: 'staff1@centralclinic.local',
    password: 'StaffPassword123!',
  });

  if (authError || !authData.session) {
    console.warn(`Could not sign in staff1, falling back to service-role client for advance: ${authError?.message}`);
  }

  let messageReceived = false;

  const resultPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!messageReceived) {
        reject(new Error('Timeout: Did not receive broadcast message within 10 seconds.'));
      }
    }, 10000);

    // 3. Anonymous client subscribes to public topic (private: false)
    const channel = anonClient.channel(TOPIC, {
      config: {
        broadcast: { ack: false },
        private: false,
      },
    });

    channel
      .on('broadcast', { event: 'queue_state_update' }, (response) => {
        console.log('>>> Anonymous client successfully received broadcast message:');
        console.dir(response.payload, { depth: null });
        messageReceived = true;
        clearTimeout(timeout);
        anonClient.removeChannel(channel).then(() => resolve());
      })
      .subscribe(async (status) => {
        console.log(`Anonymous channel status: ${status}`);

        if (status === 'SUBSCRIBED') {
          console.log('Anonymous client subscribed to public topic. Issuing token and advancing queue...');

          // Issue a token first
          const caller = authData?.session ? staffClient : createClient(supabaseUrl, serviceRoleKey);
          await caller.rpc('issue_token', {
            p_queue_id: TEST_QUEUE_ID,
            p_phone: '+8801700000099',
            p_request_id: crypto.randomUUID(),
          });

          // Call advance_queue to fire the database broadcast trigger
          const { data: advanceData, error: advanceError } = await caller.rpc('advance_queue', {
            p_queue_id: TEST_QUEUE_ID,
            p_action: 'next',
            p_expected_serving_token_id: null,
          });

          if (advanceError) {
            clearTimeout(timeout);
            reject(new Error(`Failed to advance_queue: ${advanceError.message}`));
          } else {
            console.log('advance_queue executed successfully. Serving number:', advanceData?.serving_number);
            console.log('Waiting for broadcast delivery on anonymous client...');
          }
        }
      });
  });

  await resultPromise;
  console.log('REALTIME SPIKE PASSED: Anonymous broadcast on public topics confirmed working after advance_queue!');
}

runSpike().catch((err) => {
  console.error('REALTIME SPIKE FAILED:', err.message);
  process.exit(1);
});
