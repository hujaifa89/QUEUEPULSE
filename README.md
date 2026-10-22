# QueuePulse

> Real-time queue and wait-time management web application for doctor's chambers, diagnostic centers, banks, and service centers in Bangladesh.

QueuePulse removes the "which number is running?" uncertainty. It shows the live serial and a moving-average wait time on the visitor's own phone with **no app installation and no login required**.

---

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, TypeScript strict mode)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL 15, Supabase Auth, Realtime Broadcast from Database, Row Level Security)
- **Validation**: [Zod](https://zod.dev/)
- **Testing**:
  - Unit Tests: [Jest](https://jestjs.io/)
  - Database Tests: [pgTAP](https://pgtap.org/) (`supabase test db`)
  - End-to-End Tests: [Playwright](https://playwright.dev/)
  - API Contracts: [Postman](https://www.postman.com/)
- **Hosting**: Vercel & Supabase Cloud

---

## 🏛 Architecture Rules

1. **Modular Monolith**: One Next.js app and one PostgreSQL database. No microservices or distributed message queues.
2. **Database Functions Own Queue State**: State changes and token issuing only occur via `SECURITY DEFINER` functions with `search_path` set and direct execute revoked from `PUBLIC`. No direct `INSERT` or `UPDATE` table policies on `tokens` or `queue_state`.
3. **Single Business Rule Implementation**: Numbering, state transitions, moving-average computation, and near-turn logic live in SQL. The client only calculates people ahead and multiplies by stored `avg_service_minutes`.
4. **Calculations**:
   - `People ahead` = serving token (if its number is lower than mine) + waiting tokens with a lower number.
   - `ETA` = `people ahead` × `avg_service_minutes`.
5. **Role Separation**: `admin` (platform owner) and `staff` (tied to one organization). Visitors are anonymous and access data only through `get_token_view` and the broadcast topic `queue:<queue_id>`.
6. **Restricted Service-Role Client**: Created exclusively in `src/lib/supabase/service.ts` and only imported by outbox processing, push registration, staff account creation, and PII purge. Never in client code.
7. **Time Handling**: Timestamps stored in UTC; queue days and reports calculated in **Asia/Dhaka** (`UTC+6`).
8. **Error Format**: JSON errors use `{ "error": { "code", "message", "requestId" } }`. Cross-tenant resources return `404`.
9. **Privacy & PII**: Phone numbers are optional, stored as `+8801XXXXXXXXX`, never sent to live visitor pages or logged, masked in staff UI, and purged after 7 days.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [npm](https://www.npmjs.com/) v10 or higher
- [Docker](https://www.docker.com/) (for running Supabase CLI locally)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` or via package manager)

### Installation & Local Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd queuepulse
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment configuration:
   ```bash
   cp .env.example .env.local
   ```
   Ensure `.env.local` contains valid configuration for local development.

4. **Start Local Supabase Environment**:
   ```bash
   supabase start
   ```

5. **Start Next.js Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Available Scripts

| Script | Command | Description |
| --- | --- | --- |
| **dev** | `npm run dev` | Runs the Next.js development server on port 3000 |
| **build** | `npm run build` | Compiles the production application bundle |
| **start** | `npm start` | Starts the production server |
| **lint** | `npm run lint` | Runs ESLint with Next.js core web vitals and strict checks |
| **typecheck** | `npm run typecheck` | Runs the TypeScript compiler to verify all types without emitting files |
| **test** | `npm test` | Runs the Jest unit test suite |
| **test:e2e** | `npm run test:e2e` | Runs Playwright end-to-end browser tests |
| **test:smoke** | `npm run test:smoke` | Runs Playwright production smoke tests against local or deployed URL |
| **test:db** | `npm run test:db` | Runs Supabase pgTAP database tests |
| **seed:users** | `npm run seed:users` | Seeds local test users and organizations |
| **seed:admin** | `npm run seed:admin` | Provisions the initial platform administrator account |
| **benchmark:latency** | `npm run benchmark:latency` | Runs the 100-subscriber Realtime latency load test (NFR-01) |
| **audit:secrets** | `npm run audit:secrets` | Scans workspace for leaked API keys, tokens, and private keys |
| **audit:contrast** | `npm run audit:contrast` | Verifies WCAG 2.1 AA relative luminance contrast ratios |

---

## 🚀 Production Release Checklist & Tagging

Before tagging and releasing `v1.0.0`, every gate in this checklist must be verified:

### 1. Code Quality & Automated Test Gates
- [x] **Lint**: `npm run lint` passes with 0 errors and 0 warnings.
- [x] **Typecheck**: `npm run typecheck` passes in TypeScript strict mode with no unannotated `any`.
- [x] **Unit Tests**: `npm test` passes all Jest suites across business-logic modules.
- [x] **Database Security Matrix**: `supabase test db` (pgTAP) passes all 7 suites verifying RLS, token numbering, advance atomicity, and function privileges.
- [x] **Integration Concurrency**: `npm run test:integration` proves atomic row locking under concurrent staff presses.
- [x] **End-to-End Suite**: `npm run test:e2e` passes all Playwright journeys (auth, admin, staff controller, live visitor, reports).
- [x] **Production Bundle**: `npm run build` succeeds without bundle errors.

### 2. Security & Compliance Gates (Phase 9)
- [x] **CSP & Headers**: Strict `Content-Security-Policy`, `HSTS`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` active in `next.config.js`.
- [x] **Service Role Boundary**: Confirmed `src/lib/supabase/service.ts` is never imported by client code and only used by the 4 authorized server modules.
- [x] **Origin & CSRF Checks**: All state-changing route handlers validate `Origin` header against Host.
- [x] **Error Sanitization (SEC-12)**: Responses never leak SQL strings, stack traces, database credentials, or visitor phone numbers.
- [x] **Secret Scan**: Workspace secret scan (`npm run audit:secrets`) reports 0 high/critical leaks.
- [x] **Accessibility (WCAG 2.1 AA)**: Automated `@axe-core/playwright` audit reports 0 critical or serious violations; palette contrast ratios satisfy $\ge 4.5:1$ for normal text and $\ge 17:1$ for primary text.

### 3. Cloud Configuration & Verification Gates (Phase 10)
- [x] **Operational Runbook**: `docs/deployment.md` complete with step-by-step instructions and human-only action tracker.
- [x] **Free-Plan Limits Review (Assumption A-04)**: Realtime connections (200), message quota (2M), inactivity pause (7 days), and email rate limit (3-4/hr) analyzed and mitigations documented.
- [x] **Database Health Probe**: `GET /api/health` queries `public.health_check()` (`SELECT 1`) via the server client without leaking connection details.
- [x] **PII Retention Purge (SEC-11)**: Scheduled daily at 04:00 UTC via `vercel.json` crons protected by `CRON_SECRET`.
- [x] **Rollback Plan**: Vercel 1-click deployment rollback and database forward-fix policy documented with pre-migration backup commands.
- [x] **Production Smoke Test**: `npm run test:smoke` verifies health, login, queue creation, token issuing, visitor live tracking, advancing, reports, and logout.

### 4. Release Tagging (`v1.0.0`)
When all checklist items above are satisfied and confirmed by the team:

```bash
# 1. Ensure working tree is clean and on main
git status

# 2. Create annotated git tag
git tag -a v1.0.0 -m "Release v1.0.0: QueuePulse MVP Production Release"

# 3. Push tag to remote repository
git push origin v1.0.0
```

---

## 📂 Project Directory Structure

```
queuepulse/
├── .github/
│   ├── dependabot.yml         # Weekly automated dependency vulnerability updates
│   └── workflows/ci.yml       # Multi-stage GitHub Actions CI workflow
├── docs/
│   ├── blueprint.md           # Full engineering specification
│   ├── decisions.md           # Architecture decision log (DEC-01 to DEC-18)
│   └── deployment.md          # Production deployment & operations runbook
├── public/                    # Static assets & service workers (sw.js)
├── scripts/
│   ├── calculate-contrast.ts  # WCAG color contrast calculator
│   ├── create-admin.ts        # Platform admin provisioning CLI
│   ├── security-audit.ts      # Secret scanner and client bundle sentinel check
│   ├── seed-users.ts          # Local user seeder
│   └── load/
│       └── realtime-latency.ts # 100-subscriber Realtime load benchmark (NFR-01)
├── src/
│   ├── app/                   # Next.js App Router (pages & API routes)
│   │   ├── api/health/        # GET /api/health endpoint with DB reachability check
│   │   ├── api/internal/purge # Daily PII purge endpoint (Vercel Cron)
│   │   ├── globals.css        # Tailwind styles & theme variables
│   │   ├── layout.tsx         # Root HTML layout & metadata
│   │   └── page.tsx           # Home landing page
│   ├── components/ui/         # Reusable design system components
│   ├── features/              # Feature slices (queue, live, notifications, reports, admin)
│   ├── i18n/                  # Bilingual localization (English & Bengali)
│   └── lib/
│       ├── env.ts             # Zod-validated environment configuration
│       ├── http/              # Error mapping & HTTP handler wrapper
│       ├── supabase/          # Supabase client factories (browser, server, service)
│       └── time.ts            # Asia/Dhaka timezone calculations
├── supabase/
│   ├── config.toml            # Supabase local environment config
│   ├── migrations/            # SQL migration files (01-19)
│   ├── seed.sql               # Database seed data
│   └── tests/                 # pgTAP SQL tests (01-07)
├── tests/
│   ├── api/                   # Postman API test collections
│   ├── e2e/                   # Playwright end-to-end tests
│   ├── integration/           # Concurrency integration tests
│   ├── smoke/                 # Production smoke test suite
│   └── unit/                  # Jest unit test suites
└── vercel.json                # Vercel deployment & daily cron schedule
```

---

## ⚠️ Known Limitations

- **LIM-01**: There is no "set current number" tool. After an outage, staff press Next once per patient already served on paper; durations under 20s are excluded from average calculation (D-04) so quick presses do not distort ETA. Staff must not use Skip to catch up.
- **LIM-02**: A failed alert is retried only on the next staff action.
- **LIM-03**: The push-subscribe rate limit is best effort (in-memory per server instance).
- **LIM-04**: Web Push on iPhone may require adding the page to the Home Screen; in-page alert and SMS serve as reliable fallbacks.
- **LIM-05**: ETA is only as good as staff pressing Next at the real moment a visit begins.
- **LIM-06**: SMS runs on a mock provider until an external SMS gateway is configured.

