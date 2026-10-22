# QueuePulse – Production Deployment & Operations Runbook

This document serves as the operational runbook and deployment manual for QueuePulse. It details step-by-step instructions for provisioning cloud infrastructure, configuring security settings, managing migrations, assessing free-tier limitations, rolling back deployments, and executing production smoke verification.

---

## 📋 Human-Only Steps Tracker

Before proceeding with automated scripts, the following human actions must be performed in cloud provider dashboards.

| Step | Action | Platform | Status | Owner | Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **H-01** | Create Supabase project in region closest to Bangladesh (Singapore `ap-southeast-1` or Mumbai `ap-south-1`) | Supabase Dashboard | **Human Action Required** | DevOps / Team Lead | Project URL and reference ID obtained |
| **H-02** | Disable public user sign-ups (`enable_signup = false`) | Supabase Dashboard -> Auth -> Providers -> Email | **Human Action Required** | Platform Admin | Public sign-up toggle turned off |
| **H-03** | Set Minimum Password Length to 10 characters | Supabase Dashboard -> Auth -> Password Protection | **Human Action Required** | Platform Admin | Input set to `10` |
| **H-04** | Configure Site URL and Wildcard Redirect URLs | Supabase Dashboard -> Auth -> URL Configuration | **Human Action Required** | Platform Admin | Site URL set to production HTTPS domain |
| **H-05** | Configure Custom SMTP Provider (Resend/SendGrid/SES) | Supabase Dashboard -> Auth -> SMTP Settings | **Human Action Required** | Platform Admin | Test email delivered successfully |
| **H-06** | Generate VAPID keypair & `CRON_SECRET` | Terminal (Local) | **Human Action Required** | DevOps Engineer | Keys saved to secure vault |
| **H-07** | Create Vercel project and set Environment Variables | Vercel Dashboard -> Project Settings -> Environment Variables | **Human Action Required** | DevOps Engineer | All 8 variables set per environment |
| **H-08** | Provision and link Custom Domain with SSL/TLS | Vercel Dashboard -> Settings -> Domains | **Human Action Required** | DevOps Engineer | HTTPS active on custom domain |
| **H-09** | Run initial admin provisioning script | Terminal / Supabase CLI | **Human Action Required** | Platform Admin | Admin password saved to 1Password/Bitwarden |
| **H-10** | Perform Pre-Migration Database Backup | Terminal (`supabase db dump`) | **Human Action Required** | Database Admin | SQL export file stored securely |

---

## 1. ☁️ Supabase Cloud Project Provisioning

### 1.1 Project Creation
1. Sign in to [Supabase Cloud](https://app.supabase.com).
2. Click **New Project** and configure:
   - **Name**: `queuepulse-prod`
   - **Database Password**: Generate a secure 32-character password and store it in your team's password manager.
   - **Region**: Select **Singapore (`ap-southeast-1`)** or **Mumbai (`ap-south-1`)** for optimal network latency (< 60 ms) to Bangladesh.
   - **Pricing Plan**: Free (or Pro if concurrency requirements exceed 200 connections).

### 1.2 Link Repository and Push Database Migrations
Run the following commands from your local repository root:

```bash
# 1. Login to Supabase CLI (if not already authenticated)
supabase login

# 2. Link your local repository to the remote cloud project
supabase link --project-ref <your-supabase-project-ref>

# 3. Take a pre-migration backup (Safety Rule)
supabase db dump -f backup_pre_release.sql

# 4. Push all migrations (01 through 19) to the production database
supabase db push
```

Verify that all tables and functions are created:
- Tables: `organizations`, `profiles`, `queues`, `queue_state`, `tokens`, `push_subscriptions`, `notification_outbox`, `audit_events`.
- Functions: `issue_token`, `advance_queue`, `pause_queue`, `resume_queue`, `recall_token`, `purge_expired_pii`, `health_check`, `get_token_view`, `admin_overview`, `report_summary`.

---

## 2. 🔐 Supabase Auth & Security Settings

### 2.1 Disable Public User Sign-ups (SEC-01, C-01)
1. Go to **Authentication** -> **Providers** -> **Email**.
2. **Uncheck "Allow new users to sign up"** (`enable_signup = false`).
3. Click **Save**.
   > *Rationale*: QueuePulse is invite-only. Platform administrators create staff accounts via the administrative dashboard (`/admin`), and staff log in with temporary credentials.

### 2.2 Enforce Password Length (SEC-01)
1. Go to **Authentication** -> **Password Protection**.
2. Set **Minimum Password Length** to **10**.
3. Enable "Prevent password re-use" if available.
4. Click **Save**.

### 2.3 URL Configuration & Redirect Allowlist
1. Go to **Authentication** -> **URL Configuration**.
2. Set **Site URL** to your canonical production URL:
   ```
   https://queuepulse.vercel.app  (or https://queuepulse.app)
   ```
3. In **Redirect URLs**, add:
   ```
   https://queuepulse.vercel.app/**
   https://queuepulse.app/**
   http://localhost:3000/**
   ```
4. Click **Save**.

### 2.4 Custom SMTP Configuration & Rate Limit Verification
> [!WARNING]
> **Supabase Auth Built-in Email Limit**: The default built-in email service is strictly rate-limited to **3 to 4 emails per hour** on the Free Tier ([Official Documentation](https://supabase.com/docs/guides/auth/auth-smtp)). If staff members request password resets beyond this threshold, requests will be dropped or fail.

For production release, configure a dedicated transactional SMTP provider (e.g., [Resend](https://resend.com) or [SendGrid](https://sendgrid.com)):
1. Go to **Authentication** -> **SMTP Settings**.
2. Enable **Enable Custom SMTP**.
3. Enter provider credentials:
   - **Sender Email**: `noreply@queuepulse.app`
   - **Sender Name**: `QueuePulse`
   - **Host**: `smtp.resend.com` (or provider host)
   - **Port**: `587`
   - **Username**: `resend` (or provider username)
   - **Password**: `<YOUR_SMTP_API_KEY>`
4. Send a test email and verify delivery in your inbox.

---

## 3. 📡 Realtime Broadcast Configuration (DEC-03)

1. Go to **Project Settings** -> **Realtime**.
2. Verify that **Realtime** is toggled **ON**.
3. **Public Topic Architecture**:
   - QueuePulse uses **Database-Triggered Broadcast** via `realtime.send(payload, 'queue_state_update', 'queue:' || NEW.queue_id, false)`.
   - The flag `private: false` ensures channels under topic `queue:<queue_id>` are public topics.
   - Anonymous visitor clients subscribe using `supabase.channel(topic, { config: { private: false } })` using only the public `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - No RLS policies or visitor authentications are required for receiving public queue counter broadcasts.

---

## 4. 🔑 Secrets and Key Generation

Generate the required cryptographic keys before deploying:

### 4.1 Generate Web Push VAPID Keypair
```bash
npx web-push generate-vapid-keys
```
*Output format:*
- `Public Key`: e.g. `BEl62iUYgUivxIkv69yViEuiBIa...` (Used for `NEXT_PUBLIC_VAPID_PUBLIC_KEY`)
- `Private Key`: e.g. `a1b2c3d4e5f6...` (Used for `VAPID_PRIVATE_KEY` - Server Only!)

### 4.2 Generate CRON_SECRET
Generate a 32-byte cryptographic hex token for securing the PII purge endpoint:
```bash
# On Linux / macOS / Git Bash:
openssl rand -hex 32

# Or via Node.js in PowerShell:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. 🚀 Vercel Deployment & Environment Variables

### 5.1 Project Setup
1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository `queuepulse`.
4. Framework Preset: **Next.js**.
5. Root Directory: `./`.

### 5.2 Environment Variables Configuration
Configure the following environment variables in **Project Settings** -> **Environment Variables** for **Production** and **Preview**:

| Variable Name | Exposure | Required Value / Description | Example |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Project URL | `https://xyzproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase Anonymous Client Key | `eyJhbGciOi...` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | VAPID Public Key for Web Push | `BEl62iUYg...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-Only** | Supabase Service Role Secret Key | `eyJhbGciOi...` |
| `VAPID_PRIVATE_KEY` | **Server-Only** | VAPID Private Key for Push Sending | `secr3tKey...` |
| `VAPID_SUBJECT` | **Server-Only** | Contact URI for Web Push Identification | `mailto:admin@queuepulse.app` |
| `SMS_PROVIDER` | **Server-Only** | SMS provider adapter (`mock` for MVP) | `mock` |
| `CRON_SECRET` | **Server-Only** | Shared secret for securing Vercel Cron | `32_byte_hex_token...` |

> [!CAUTION]
> **Architecture Rule 6**: Under no circumstances should `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, or `CRON_SECRET` be prefixed with `NEXT_PUBLIC_`. Doing so exposes administrative privileges to client browser bundles.

---

## 6. 🧹 Retention and Purge Scheduling (DEC-16, SEC-11)

To comply with **SEC-11** (7-day PII retention), visitor phone numbers and push subscriptions older than 7 days must be purged daily.

### 6.1 Vercel Cron Job Configuration
`vercel.json` is configured in the repository root:
```json
{
  "crons": [
    {
      "path": "/api/internal/purge",
      "schedule": "0 4 * * *"
    }
  ]
}
```
- Schedule: Runs every day at **04:00 UTC** (which corresponds to **10:00 AM Asia/Dhaka time**).
- Authentication: Vercel Cron automatically attaches `Authorization: Bearer <CRON_SECRET>` to the invocation header when `CRON_SECRET` is defined in Vercel environment variables.
- Verification: The handler calls database function `purge_expired_pii()` using the service-role client and logs the number of purged phone numbers and subscriptions.

### 6.2 Alternative: Database pg_cron (Optional)
If using Supabase Pro or self-hosted PostgreSQL where `pg_cron` is enabled:
```sql
SELECT cron.schedule(
  'daily-pii-purge-dhaka',
  '0 4 * * *',
  'SELECT public.purge_expired_pii();'
);
```

---

## 7. 🌐 Custom Domain & HTTPS Requirement

### Web Push Mandate
Browsers (Google Chrome, Firefox, Safari iOS 16.4+) strictly mandate a **Secure Context (`https://`)** for registering Service Workers (`public/sw.js`) and subscribing to PushManager.

### Setup Instructions
1. In Vercel, navigate to **Project Settings** -> **Domains**.
2. Add your custom domain (e.g. `queuepulse.app` or `queue.yourclinic.com`).
3. Update your DNS registrar with the provided CNAME (`cname.vercel-dns.com`) or A record (`76.76.21.21`).
4. Wait for Vercel to issue the automatic Let's Encrypt SSL/TLS certificate.
5. Verify that `https://<your-domain>` opens with a valid lock icon.

---

## 8. 👤 First Platform Admin Account Creation

Run the dedicated administrative provisioning script against the production database:

```bash
# Provision Admin Account
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
ADMIN_EMAIL=admin@queuepulse.app \
ADMIN_NAME="Platform Administrator" \
npm run seed:admin
```

> [!IMPORTANT]
> The script generates and displays a cryptographically secure 16-character temporary password.
> 1. Copy the password immediately.
> 2. Save it in the organization password manager (1Password / Bitwarden).
> 3. Clear the terminal buffer to prevent shoulder-surfing.

---

## 9. 📊 Free-Plan Limitations & Risk Assessment (Assumption A-04)

Review of current official documentation for Vercel and Supabase Free tiers:

### 9.1 Verified Service Limits

| Resource | Free Tier Limit | Source Documentation | Status |
| :--- | :--- | :--- | :--- |
| **Supabase Realtime Connections** | **200 concurrent connections** | [Supabase Pricing](https://supabase.com/pricing) & [Realtime Limits](https://supabase.com/docs/guides/realtime/pricing-and-limits) | **Verified** |
| **Supabase Realtime Messages** | **2,000,000 messages / month** | [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing-and-limits) | **Verified** |
| **Supabase Database Storage** | **500 MB** | [Supabase Pricing](https://supabase.com/pricing) | **Verified** |
| **Supabase Egress Bandwidth** | **5 GB / month** | [Supabase Pricing](https://supabase.com/pricing) | **Verified** |
| **Supabase Inactivity Pausing** | **Paused after 7 days without API requests** | [Supabase Pausing Guide](https://supabase.com/docs/guides/platform/pausing) | **Verified** |
| **Supabase Auth Emails** | **3 to 4 emails / hour** (built-in mailer) | [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp) | **Verified** |
| **Vercel Cron Jobs (Hobby)** | **1 cron job / day** | [Vercel Cron Usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) | **Verified** |
| **Vercel Serverless Timeout (Hobby)** | **10 seconds** execution limit | [Vercel Function Limits](https://vercel.com/docs/functions/limitations) | **Verified** |

### 9.2 Comparison with Requirements and Demo Plan

1. **NFR-01 Realtime Latency (100 Concurrent Viewers per Queue)**:
   - *Requirement*: 95% of serial updates delivered within 2.0s with 100 simultaneous viewers on a single queue.
   - *Limit*: Supabase Free tier allows 200 peak concurrent connections.
   - *Verdict*: **Compatible for a single-queue demonstration** (100 subscribers consume 50% of the connection quota).
   - *Risk*: If multiple clinics run simultaneous queues or the audience exceeds 200 concurrent connected browser tabs, connection drops will occur.
   - *Mitigation*: Fallback polling (every 10s) keeps queue positions accurate even if sockets are rejected. Upgrade to Pro ($25/mo for 500 concurrent connections) for multi-tenant production.

2. **Project Pausing Risk (Assumption A-04)**:
   - *Risk*: Supabase Free projects enter a "Paused" state after 7 consecutive days of inactivity. If the capstone demo occurs a week after deployment, visitors scanning QR codes will encounter 500 errors or a 2-minute unpausing cold start.
   - *Mitigation*: DevOps must verify project health 24 hours prior to the demo and run `npm run test:smoke` or ping `/api/health`.

3. **Email Rate Limit Risk**:
   - *Risk*: The built-in Supabase Auth email service allows only 3-4 password resets per hour.
   - *Mitigation*: Platform admin sets temporary passwords directly when creating staff accounts (DEC-14), eliminating reliance on email delivery. For production, configure custom SMTP via Resend.

---

## 10. 🔄 Rollback & Disaster Recovery Procedures

### 10.1 Vercel Application Rollback (Zero Downtime)
If a faulty web application build is deployed:
1. Open **Vercel Dashboard** -> **Deployments**.
2. Locate the previous healthy deployment.
3. Click the **three dots menu (`...`)** -> **Rollback to this deployment**.
4. Vercel instantly routes 100% of incoming production traffic to the previous immutable bundle (< 2 seconds).

### 10.2 Database Forward-Fix Policy
In accordance with production best practices, database migrations follow a **Forward-Fix Policy**:
- **Do NOT run arbitrary `DROP` or `ROLLBACK` commands in production**, as this can destroy patient tokens and audit history.
- Instead, create a targeted forward migration:
  ```bash
  supabase migration new fix_issue_description
  ```
- Write the compensating schema or function update, test locally with `supabase test db`, and deploy via `supabase db push`.

### 10.3 Pre-Migration Backup & Emergency Restore
Before executing any migration in production:
```bash
# 1. Take a full schema and data export
supabase db dump --project-ref <project-ref> -f backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Emergency Restore (if database corruption occurs)
# Connect to PostgreSQL direct connection string via psql:
psql "postgres://postgres.<ref>:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres" -f backup_latest.sql
```

---

## 11. 🧪 Production Verification & Smoke Test

### 11.1 Automated Production Smoke Test
Run the Playwright smoke suite against your deployed production URL:

```bash
PLAYWRIGHT_TEST_BASE_URL=https://queuepulse.vercel.app \
SMOKE_STAFF_EMAIL=staff1@centralclinic.local \
SMOKE_STAFF_PASSWORD=StaffPassword123! \
npm run test:smoke
```

*What is verified automatically:*
1. `GET /api/health` returns `200 OK` with database reachability (`SELECT 1`).
2. Landing page renders branding and accessibility elements.
3. Staff authentication succeeds and redirects to `/dashboard`.
4. Queue creation and Token issuing (with QR code slip generation).
5. Anonymous visitor page opens via public token code (`/t/[code]`).
6. Staff presses "Next", advancing queue state.
7. Visitor page receives live broadcast update without page refresh.
8. Daily reports and CSV export links load properly.
9. Staff signs out, terminating session cookie.

### 11.2 Realtime Latency Benchmark on Deployed Cloud
To measure real-world network latency against your Supabase Cloud instance:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
SUBSCRIBER_COUNT=50 \
ADVANCE_CYCLES=10 \
npm run benchmark:latency
```

### 11.3 Manual Web Push Test Protocol
Test Web Push delivery on a physical Android smartphone or desktop browser:
1. Open `https://<your-domain>/t/<code_of_token_4>` on a mobile browser (Chrome/Edge/Safari).
2. Click **"Enable Notifications" (নোটিফিকেশন চালু করুন)** on the visitor page.
3. Accept the native browser notification permission prompt.
4. Verify the UI switches to "Notifications Active".
5. In another tab or laptop, log into `/dashboard/queues/[id]` as Staff.
6. Press **Next** until only 3 people are ahead of token #4.
7. **Verification**:
   - The device displays a push alert: *"QueuePulse: Your turn is approaching! (সিরিয়াল এগিয়ে এসেছে)"*.
   - Vibration pattern triggers.
   - Tapping the notification refocuses the live queue tracker.
