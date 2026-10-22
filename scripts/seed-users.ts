import { createClient } from '@supabase/supabase-js';

// Local development user seeder
// Architecture Rule 6: Uses service role key for admin user seeding in local development
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role_key';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'staff';
  orgId: string | null;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@queuepulse.local',
    password: 'AdminPassword123!',
    fullName: 'Platform Administrator',
    role: 'admin',
    orgId: null,
  },
  {
    email: 'staff1@centralclinic.local',
    password: 'StaffPassword123!',
    fullName: 'Nasrin Receptionist',
    role: 'staff',
    orgId: 'a0000000-0000-0000-0000-000000000001', // Dhaka Central Clinic
  },
  {
    email: 'staff2@uttaradiag.local',
    password: 'StaffPassword123!',
    fullName: 'Rahim Receptionist',
    role: 'staff',
    orgId: 'a0000000-0000-0000-0000-000000000002', // Uttara Diagnostic Center
  },
];

async function seedUsers() {
  console.log('Seeding local users with service-role client...');

  for (const user of SEED_USERS) {
    let userId: string | null = null;

    // Check if user already exists
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error(`Failed to list users: ${listError.message}`);
      process.exit(1);
    }

    const existingUser = listData.users.find((u) => u.email === user.email);

    if (existingUser) {
      userId = existingUser.id;
      console.log(`User ${user.email} already exists (ID: ${userId})`);
    } else {
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Failed to create user ${user.email}: ${createError.message}`);
        process.exit(1);
      }

      userId = createData.user.id;
      console.log(`Created user ${user.email} (ID: ${userId})`);
    }

    // Upsert into profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        role: user.role,
        org_id: user.orgId,
        full_name: user.fullName,
        is_active: true,
      });

    if (profileError) {
      console.error(`Failed to upsert profile for ${user.email}: ${profileError.message}`);
      process.exit(1);
    }

    console.log(`Upserted profile for ${user.email} [${user.role}]`);
  }

  console.log('User seeding completed successfully.');
}

seedUsers().catch((err) => {
  console.error('Unexpected seeding error:', err);
  process.exit(1);
});
