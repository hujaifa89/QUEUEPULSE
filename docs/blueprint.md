# QueuePulse – Engineering Blueprint
Oct 20, 2026 · @MD HUJAIFA AZAD

## 1. Project Understanding

QueuePulse removes the "which number is running?" uncertainty at chambers, diagnostic centers, banks and service centers. It shows the live serial and a computed waiting time on the visitor's own phone, with no app and no login.

| Item | Summary |
| --- | --- |
| Core problem | Visitors wait 2–3 hours after booking because the current serial is invisible; receptionists answer the same call repeatedly. |
| Target users | Visitors (no account), receptionists/staff, platform administrator. |
| Value proposition | Stay home until your turn is near; staff advance the queue with one click. |
| Essential features | Token + QR, Next/Skip controller, live view, moving-average ETA, near-turn alert. |
| Constraints | 3-person student team (Database; Frontend + Project management; Backend/API), 10-week timeline, free-tier hosting assumed. |
| Existing code | None stated; treated as a new repository. |

### Measurable success criteria (targets to validate, not yet measured)
- Serial change appears on 95% of connected visitor screens within 2 seconds, with 100 viewers on one queue.
- A staff "Next" action needs 1 click and the server responds within 1 second.
- Visitor live page shows its first useful content within 3 seconds on a mid-range phone over 4G.
- ETA accuracy is reported from a simulated queue test; target mean absolute error of 20% or less when service times are stable.

---

## 2. MVP Scope

The MVP is one complete loop: staff issue a token, advance the queue, and the visitor sees live position and ETA. Everything else waits.

| Priority | Feature | Note |
| --- | --- | --- |
| Must | Staff sign-in, role-based access | Accounts created by admin |
| Must | Organizations, staff and queue setup (admin / staff) | Minimal forms |
| Must | Issue token, QR slip, public live link | Sequential number per queue per day |
| Must | 1-click Next / Skip controller | Atomic, safe for two staff clicking together |
| Must | Visitor live view (no login) | Realtime plus polling fallback |
| Must | Moving-average wait-time (last 5) | Rules for skips, breaks, cold start in FR-11 |
| Must | Near-turn alert at 3 ahead | In-page alert plus Web Push |
| Must | Basic reports | Tokens, average wait, average service time |
| Should | SMS alert through a gateway | Needs phone number and per-SMS cost; behind a provider adapter |
| Should | Pause / resume queue, recall skipped token | Real receptionist needs, small effort |
| Should | Peak-hour report, CSV export | After core reports work |
| Excluded | Payments, native app, ML prediction, hospital/bank integration | As in the proposal |
| Excluded | Visitor accounts, online booking, WhatsApp/voice alerts | Future enhancements |

---

## 3. Assumptions, Contradictions, Risks and Open Decisions

### Contradictions and weak assumptions found in the proposal

| ID | Issue | Resolution proposed |
| --- | --- | --- |
| C-01 | "Registration" for staff, but the admin manages staff accounts. | No public sign-up. Admin creates staff; staff log in and reset password. |
| C-02 | "Zero-app browser alert" is unreliable on iPhone: Web Push there generally needs the page added to the Home Screen (verify against current Apple documentation). | In-page alert (banner, vibration) works everywhere while the page is open; Web Push is best effort; SMS is the reliable fallback. |
| C-03 | "Token slip with QR" assumes a printer. | Show the QR on screen and print through the browser print dialog; no printer driver work. |
| C-04 | Average of the last 5 services breaks on lunch breaks, skips and the first tokens of the day. | Defined in FR-11: exclude skipped and over-long durations, default minutes per queue. |
| C-05 | "Administrator" is both platform owner and clinic manager. | Two roles: admin (platform) and staff (bound to one organization). |

### Assumptions

| ID | Assumption |
| --- | --- |
| A-01 | Queue day resets at midnight Asia/Dhaka. |
| A-02 | Visitor phone number is optional and deleted 7 days after the token day. |
| A-03 | Service time = time between a token being called and the next token being called. Staff must press Next honestly for the ETA to be meaningful. |
| A-04 | Free tiers of Vercel and Supabase are enough for a capstone demo. Their current limits (realtime connections, project pausing on inactivity) are not verified here and must be checked before deployment. |
| A-05 | Pilot data from a real chamber is not guaranteed; accuracy will be shown with a simulation. |

### Risks

| ID | Risk | Probability | Impact | Mitigation | Phase |
| --- | --- | --- | --- | --- | --- |
| R-01 | Two staff click Next together and a token is skipped or duplicated | Medium | High | One Postgres function with a row lock; concurrency test | DB / API |
| R-02 | Realtime drops on weak mobile networks | High | Medium | Auto-reconnect plus 10-second polling fallback | Frontend |
| R-03 | Web Push not delivered (iOS, blocked permission) | High | Medium | In-page alert, SMS option, clear on-screen message | Notifications |
| R-04 | SMS cost or gateway approval delays | Medium | Medium | Provider adapter with mock; SMS marked Should | Notifications |
| R-05 | Public live page leaks data | Low | High | Page shows only numbers; unguessable IDs; RLS | Security |
| R-06 | Inaccurate ETA reduces trust | Medium | Medium | Show "about", rules in FR-11, simulation test | Backend |
| R-07 | Scope growth in a 10-week, 3-person project | Medium | High | Fixed MVP table; Should items only after Must pass tests | All |

### Open decisions (default applies if you do not answer)

| ID | Question | Default |
| --- | --- | --- |
| D-01 | Visitor page language | Bangla default, English toggle; staff UI in English |
| D-02 | SMS gateway provider | Adapter interface, mock provider until you choose one |
| D-03 | Can a skipped token be recalled? | Yes, once, by staff (Should) |

---

## 4. Technology Direction

Keep the stack from the proposal: Next.js with TypeScript, Supabase (PostgreSQL, Auth, Realtime, Row Level Security), deployed on Vercel. It gives realtime, auth and a database without running a server, which suits 3 students and 10 weeks. A modular monolith (one Next.js app plus one database) is enough; no microservices or queues.

| ID | Decision | Rationale | Alternative considered |
| --- | --- | --- | --- |
| DEC-01 | Modular monolith in Next.js (App Router) | One deploy, one codebase | Separate Node API: more work, no benefit at this size |
| DEC-02 | Queue changes run inside Postgres functions | Row lock prevents race conditions (R-01) | Logic in route handlers: unsafe under concurrent clicks |
| DEC-03 | Realtime via Broadcast from Database: a trigger on queue_state sends counters to a public topic per queue (revised in Section 14) | Visitors subscribe to numbers only, no personal data | Postgres Changes: needs anonymous read on a table; subscribing to tokens would expose phone numbers |
| DEC-04 | Polling fallback every 10 seconds | Covers dropped sockets (R-02) | Realtime only: fails silently |
| DEC-05 | Notification outbox table | A failed push/SMS is retried, not lost | Send inline only: loses alerts on a crash |
| DEC-06 | Added: Zod (validation), Tailwind CSS, Playwright (end-to-end) | Validation at trust boundaries; fast UI; critical journey tests | Not in your proposal; remove if you prefer |
| DEC-07 | Testing: Jest for logic, Postman collection for API, Playwright for end-to-end | Keeps your Jest and Postman choice | Vitest: equivalent, but proposal says Jest |

---

## 5. Product Requirements Document (PRD)

### Personas
- **Rahim, visitor**: booked a doctor, wants to stay home until his turn is near. Uses an Android phone, low patience for apps.
- **Nasrin, receptionist**: handles 60–100 patients a day, wants one button and no repeated phone calls.
- **Platform admin**: creates organizations and staff accounts, checks that the system runs.

### Primary use cases
- UC-01: Staff issue a token; the visitor scans the QR and opens the live page.
- UC-02: Staff press Next; every viewer's screen and ETA update.
- UC-03: The visitor is alerted when 3 people are ahead.
- UC-04: Admin or staff review daily counts and average waiting time.

### Functional requirements

| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-01 | Staff and admin sign in with email and password. | Wrong credentials give one generic error; logout ends the session. | Must |
| FR-02 | Password reset by email. | Reset link works once and expires. | Must |
| FR-03 | Admin manages organizations (create, edit, deactivate). | Deactivated organization's staff cannot operate queues. | Must |
| FR-04 | Admin creates and deactivates staff accounts bound to one organization. | Staff see only their organization's data. | Must |
| FR-05 | Staff create and configure queues (name, default minutes per patient, active flag). | Only own organization's queues are visible. | Must |
| FR-06 | Staff issue a token with an optional visitor phone number. | Numbers are sequential per queue per day; 20 simultaneous requests give 20 unique numbers. | Must |
| FR-07 | Token slip shows queue name, number, date and QR. | QR opens the token's live page; slip prints from the browser. | Must |
| FR-08 | Next: current token becomes completed, next waiting token becomes serving. | One click; two staff clicking together never skip or repeat a token. | Must |
| FR-09 | Skip: current token becomes skipped, next token is called. | Skipped token never counts in the average. | Must |
| FR-10 | Visitor live page needs no login and shows serving number, own number, people ahead, ETA, status. | Updates within 2 seconds; reconnects after network loss. | Must |
| FR-11 | ETA = people ahead × average service minutes. People ahead counts the serving token plus waiting tokens with a lower number. Average = mean of the last 5 completed durations; fewer than 5 uses those available; none uses the queue default; durations above 60 minutes or under 20 seconds are excluded (D-04). | Unit tests cover each case; example 6 people × 7 min = 42 min. | Must |
| FR-12 | Near-turn alert fires once per token when people ahead first becomes 3 or fewer. | In-page alert and Web Push to subscribed visitors; no duplicate alerts after refresh. | Must |
| FR-13 | Token states: waiting, serving, completed, skipped, cancelled, expired (set by the system at day end). Staff can cancel a waiting token. | Visitor sees a clear message for each state. | Must |
| FR-14 | Staff dashboard shows current token, next 5 waiting, counts, current average. | Matches database after every action. | Must |
| FR-15 | Reports by queue and date range: tokens issued, completed, skipped, average wait (issued to called), average service. | Figures match a seeded test dataset. | Must |
| FR-16 | Admin dashboard shows organizations, active queues, tokens today. | Admin only. | Must |
| FR-17 | SMS alert for tokens with a phone number. | Sent once through the provider adapter; failures are retried and logged. | Should |
| FR-18 | Pause and resume a queue; recall one skipped token. | Paused queue shows "paused" to visitors; ETA is not counted during pause. | Should |
| FR-19 | Peak-hour report and CSV export. | Hourly counts match test data. | Should |

### Non-functional requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-01 | Realtime latency | 95% of updates in 2 seconds with 100 viewers per queue |
| NFR-02 | Page load | Visitor page first content in 3 seconds, mid-range phone, 4G |
| NFR-03 | Degraded mode | If the system is down, staff can continue manually; queue state recovers when it returns |
| NFR-04 | Responsive | Works from 360 px width; staff dashboard usable on tablet and desktop |
| NFR-05 | Accessibility | Labels, focus states and colour contrast to WCAG 2.1 AA basics; state not shown by colour alone |
| NFR-06 | Browser support | Last 2 versions of Chrome, Safari, Firefox, Edge |
| NFR-07 | Privacy | Phone numbers never public; deleted 7 days after token day (A-02) |
| NFR-08 | Maintainability | TypeScript strict mode, lint clean, 70% or more coverage on business-logic modules |
| NFR-09 | Time handling | Queue day and reports use Asia/Dhaka; timestamps stored in UTC |

---

## 6. Technical Requirements Document (TRD)

### Responsibilities by layer

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind, qrcode.react | Staff dashboard, admin pages, public live page, token slip |
| Backend | Next.js route handlers | Auth-checked staff actions, notification sending, reports |
| Database | PostgreSQL on Supabase | Data, constraints, queue functions (lock, numbering), Row Level Security |
| Auth | Supabase Auth | Email and password sessions for staff and admin |
| Realtime | Supabase Realtime Broadcast from Database, one public topic per queue | Live serial to visitor screens |
| Notifications | Web Push (VAPID keys) and SMS adapter | Near-turn alerts |

### Authentication and authorization
- Roles: `admin` (platform) and `staff` (one organization). Visitors are anonymous.
- Authorization is enforced by Row Level Security and checked again in route handlers; the frontend never decides access.
- Visitor access is by a random, unguessable public code in the QR link, not by login.

### Configuration and secrets

| Variable | Where | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public by design; safe only because of RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never in client code; used only for outbox processing, push registration, staff-account creation and purge (DEC-12) |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` | Server / public key to browser | Private key server only |
| `SMS_API_KEY` | Server only | Never logged |

---

## 7. System Architecture

QueuePulse is a modular monolith: one Next.js app on Vercel talks to one Supabase project. The database owns queue correctness; the app owns screens and notifications.

### Main flows
1. **Issue token**: Staff click Issue → handler validates → `issue_token` locks the queue row, takes the next number, inserts the token and updates `queue_state` → QR link is returned.
2. **Advance**: Staff click Next → `advance_queue` completes the current token, calls the next one, records the service duration, recalculates the average, updates `queue_state`, and writes outbox rows for tokens now 3 or fewer ahead → Realtime pushes the change → handler sends the pending alerts.
3. **Visitor view**: Page loads token through the token view function → subscribes to `queue_state` → shows ETA; polls every 10 seconds if the socket fails.

---

## 8. Blueprint Progress
Phases 1-10 defined.

---

## 9. Detailed System Design

### Modules and data ownership

| Module | Responsibility | Owns |
| --- | --- | --- |
| Access | Resolve session, role, organization; block deactivated users | `profiles`, `organizations` |
| Queue setup | Queue name, default minutes per patient, active flag | `queues` |
| Token issuing | Number allocation, public code, optional phone | `tokens` |
| Queue advance | Token state machine: Next, Skip, Cancel, Recall | `tokens` |
| Average service rule | FR-11 average, written once in SQL | `queue_state.avg_service_minutes` |
| Live state | Public counters visitors subscribe to | `queue_state` |
| Notifications | Outbox, Web Push, SMS adapter | `notification_outbox`, `push_subscriptions` |
| Reports | Read-only aggregates over tokens | nothing (derived) |

### Token state machine

| From | Action | To | Who |
| --- | --- | --- | --- |
| `waiting` | Next or Skip (lowest number) | `serving` | Staff |
| `serving` | Next | `completed` | Staff |
| `serving` | Skip | `skipped` | Staff |
| `waiting` | Cancel | `cancelled` | Staff |
| `skipped` | Recall (Should) | `waiting`, becomes next to be called | Staff |

---

## 10. Security and Privacy Specification

| ID | Risk | Impact | Required control |
| --- | --- | --- | --- |
| SEC-01 | Weak or shared staff login | Queue manipulated | Supabase Auth; public sign-up disabled; minimum password length 10; generic login errors; cookie-based session (httpOnly) through the Supabase SSR helper. |
| SEC-02 | Staff read or change another organization's data | Data breach | Row Level Security enabled on every table; policies check profiles.org_id and profiles.is_active. Role comes from profiles, never from user-editable metadata. |
| SEC-03 | Anonymous access to tokens or phone numbers | Privacy breach | Anonymous users can only read queue_state and run the token-view function by public code. No anonymous access to tokens, profiles, outbox or subscriptions. |
| SEC-04 | Guessable token links | Others watch or cancel a visitor's token | Public code is random, at least 128 bits, never the serial number. The live page is read-only. |
| SEC-05 | Bad input | Corrupt data, errors | Zod validation in route handlers; database constraints (types, lengths, state values); phone normalised to Bangladeshi mobile format. |
| SEC-06 | SQL injection | Full compromise | Supabase client and RPC only; no SQL built from strings; every function sets a fixed search_path. |
| SEC-07 | Secret leakage | Full compromise | Service-role, VAPID private and SMS keys only in server environment variables; .env* ignored by git; secret scan before release; different keys per environment. |
| SEC-08 | Abuse of public endpoints | Cost, downtime | Platform and Supabase Auth rate limits; push-subscribe endpoint requires a valid public code. A dedicated limiter is Partially Defined: decide in Part 4. |
| SEC-09 | CSRF and XSS | Unauthorized actions | SameSite=Lax cookies and Origin check on state-changing handlers; React output escaping; no dangerouslySetInnerHTML; Content-Security-Policy and standard security headers. |
| SEC-10 | No trace of who acted | Disputes, no accountability | Each Next, Skip, Cancel and Recall stores the acting user and time. |
| SEC-11 | Phone numbers kept too long | Privacy breach | Optional field with consent text; masked in staff screens; excluded from logs and realtime; deleted 7 days after the token day by a daily purge job. |
| SEC-12 | Verbose errors and logs | Information leak | Clients get generic messages with a request ID; server logs hold no phone numbers or keys. |
| SEC-13 | Vulnerable dependencies | Compromise | Lockfile, npm audit and Dependabot; audit result is a release gate. |
| SEC-14 | Data loss | Lost reports | Migrations and seeds in git; Supabase backup features depend on plan; weekly manual export for demo. |
| SEC-15 | Deactivated staff keep access | Misuse after leaving | RLS checks is_active on every request, so deactivation is immediate. |

---

## 11. Feature Specifications
Refer to Section 11 of the full blueprint.

---

## 12. Application Flow and Navigation

| Route | Who | Purpose |
| --- | --- | --- |
| `/login`, `/reset` | Staff, admin | Sign in and password reset |
| `/dashboard` | Staff | List of own queues |
| `/dashboard/queues/[id]` | Staff | Controller: issue token, Next, Skip, Cancel |
| `/dashboard/reports` | Staff | Reports |
| `/admin` | Admin | Organizations, staff, overview |
| `/t/[code]` | Visitor | Live token page (QR target) |

---

## 13. UI/UX Design Specification

- Typography: System font stack for Latin; Noto Sans Bengali for Bangla; base 16 px; serving number 64 px bold on live page.
- Spacing: 4 px scale (4, 8, 12, 16, 24, 32); 16 px side gutter on mobile.
- Colour: Primary `#0F766E`, text `#0F172A`, background `#FFFFFF`, warning `#B45309`, danger `#B91C1C`, success `#15803D`.
- Touch targets: At least 44 × 44 px.
- Reusable components: Button, TextField, Select, Table, StatusBadge, Banner, ConfirmDialog, BigNumber, QRCard.

---

## 14. Database Design and Schema

8 tables: `organizations`, `profiles`, `queues`, `queue_state`, `tokens`, `push_subscriptions`, `notification_outbox`, `audit_events`.
Only database functions change tokens and live queue data.

---

## 15. Backend Logic and API Contracts

### Conventions
- JSON in and out.
- Errors use one shape: `{ "error": { "code", "message", "requestId" } }`.
- A resource that belongs to another organization returns 404, the same as a missing one.
- Validation failures return 400 with field messages. No stack traces or SQL errors reach the client (SEC-12).

### Error Codes
- `VALIDATION_FAILED` (400) - Bad or missing input
- `UNAUTHENTICATED` (401) - No valid session
- `FORBIDDEN` (403) - Wrong role or deactivated account or organization
- `NOT_FOUND` (404) - Missing, or not visible to the caller
- `STALE_STATE` (409) - expected_serving_token_id no longer matches
- `QUEUE_PAUSED`, `QUEUE_INACTIVE` (409) - Action not allowed in this queue state
- `TOKEN_NOT_WAITING`, `NOTHING_SERVING` (409) - Cancel or Skip in wrong state
- `TOKEN_NOT_SKIPPED`, `ALREADY_RECALLED` (409) - Recall rules (DEC-17)
- `DUPLICATE_NAME` (409) - Queue or organization name already used
- `RATE_LIMITED` (429) - Too many requests
- `INTERNAL` (500) - Unexpected failure, logged with requestId

---

## 16. Standard Project Structure

```
queuepulse/
├─ src/
│  ├─ app/                         Next.js App Router
│  │  ├─ (public)/t/[code]/        Visitor live page
│  │  ├─ (staff)/login/ dashboard/ reports/
│  │  ├─ (admin)/admin/
│  │  └─ api/                      Route handlers (Section 15)
│  ├─ features/
│  │  ├─ queue/                    Controller UI, token slip, schemas, eta.ts
│  │  ├─ live/                     Realtime subscription, polling fallback
│  │  ├─ notifications/            Push client, outbox processing, SMS adapter
│  │  ├─ reports/
│  │  └─ admin/
│  ├─ components/ui/               Button, TextField, Table, Banner, ...
│  ├─ lib/
│  │  ├─ supabase/                 browser.ts, server.ts, service.ts
│  │  ├─ http/                     Error shape, handler wrapper, rate limit
│  │  ├─ time.ts                   Asia/Dhaka date helpers
│  │  └─ env.ts                    Validated environment variables
│  ├─ i18n/                        bn.ts, en.ts
│  └─ middleware.ts                Session refresh, route protection
├─ public/sw.js                    Service worker for Web Push
├─ supabase/
│  ├─ migrations/                  One reviewed SQL file per change
│  ├─ tests/                       pgTAP: RLS, numbering, advance, average
│  ├─ seed.sql
│  └─ config.toml
├─ tests/
│  ├─ unit/                        Jest
│  ├─ e2e/                         Playwright
│  └─ api/                         Postman collection
├─ docs/                           This blueprint, decision log
├─ .env.example
└─ package.json, tsconfig.json, eslint config
```

---

## 17–22. Decisions, SQA and Readiness Summary

- DEC-01 through DEC-18 recorded.
- Phase 1 focuses on Foundation and Tooling.
