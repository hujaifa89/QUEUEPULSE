import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Platform Admin Account Provisioning Script (Phase 10, Objective 1)
 * Creates the initial platform administrator account in Supabase Auth & public.profiles.
 * 
 * Usage:
 *   ADMIN_EMAIL=admin@queuepulse.com ADMIN_NAME="Platform Admin" npx tsx scripts/create-admin.ts
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required to provision the admin account.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function generateSecurePassword(length = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@queuepulse.local';
  const fullName = process.env.ADMIN_NAME || 'Platform Administrator';
  const password = process.env.ADMIN_PASSWORD || generateSecurePassword(16);

  // SEC-01: Verify minimum password length >= 10
  if (password.length < 10) {
    console.error('Error: Admin password must be at least 10 characters long (SEC-01).');
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`QueuePulse - Admin Account Provisioning`);
  console.log(`Target Supabase URL: ${supabaseUrl}`);
  console.log(`Admin Email        : ${email}`);
  console.log(`Admin Full Name    : ${fullName}`);
  console.log(`============================================================\n`);

  // Check if admin user already exists
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error(`Failed to list users from Supabase Auth: ${listError.message}`);
    process.exit(1);
  }

  const existingUser = listData.users.find((u) => u.email === email);
  let userId = '';

  if (existingUser) {
    userId = existingUser.id;
    console.log(`Existing user found in Auth (ID: ${userId}). Updating password and confirming email...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (updateError) {
      console.error(`Failed to update admin user: ${updateError.message}`);
      process.exit(1);
    }
  } else {
    console.log(`Creating new admin user in Supabase Auth...`);
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error(`Failed to create admin user: ${createError.message}`);
      process.exit(1);
    }

    userId = createData.user.id;
    console.log(`User created successfully in Auth (ID: ${userId}).`);
  }

  // Upsert profile in public.profiles with role = 'admin' and org_id = null
  console.log(`Upserting profile in public.profiles with role = 'admin'...`);
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      role: 'admin',
      org_id: null,
      full_name: fullName,
      is_active: true,
    });

  if (profileError) {
    console.error(`Failed to upsert admin profile: ${profileError.message}`);
    process.exit(1);
  }

  console.log(`\n============================================================`);
  console.log(`ADMIN ACCOUNT READY`);
  console.log(`============================================================`);
  console.log(`Email    : ${email}`);
  console.log(`Password : ${password}`);
  console.log(`Role     : admin`);
  console.log(`------------------------------------------------------------`);
  console.log(`CRITICAL ACTION REQUIRED (HUMAN-ONLY):`);
  console.log(`1. Copy the password above immediately.`);
  console.log(`2. Save it in your team's secure password manager (e.g. 1Password / Bitwarden).`);
  console.log(`3. Clear your terminal screen or shell history.`);
  console.log(`============================================================\n`);
}

createAdmin().catch((err) => {
  console.error('Fatal error provisioning admin account:', err);
  process.exit(1);
});
