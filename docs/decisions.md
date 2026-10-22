# Architecture Decision Log

This log tracks architectural and design decisions for QueuePulse.

| ID | Decision | Rationale | Alternative Considered |
| --- | --- | --- | --- |
| DEC-01 | Modular monolith in Next.js (App Router) | One deploy, one codebase | Separate Node API: more work, no benefit at this size |
| DEC-02 | Queue changes run inside Postgres functions | Row lock prevents race conditions (R-01) | Logic in route handlers: unsafe under concurrent clicks |
| DEC-03 | Realtime via Broadcast from Database (trigger on queue_state sends counters to public topic `queue:<queue_id>`) | Visitors subscribe to numbers only, no personal data | Postgres Changes: needs anonymous read on a table; subscribing to tokens would expose phone numbers |
| DEC-04 | Polling fallback every 10 seconds | Covers dropped sockets (R-02) | Realtime only: fails silently |
| DEC-05 | Notification outbox table | A failed push/SMS is retried, not lost | Send inline only: loses alerts on a crash |
| DEC-06 | Added: Zod (validation), Tailwind CSS, Playwright (end-to-end) | Validation at trust boundaries; fast UI; critical journey tests | Not in original proposal; accepted |
| DEC-07 | Testing: Jest for logic, Postman collection for API, Playwright for end-to-end | Keeps Jest and Postman choice | Vitest: equivalent, but proposal specifies Jest |
| DEC-08 | Queue-changing functions are SECURITY DEFINER, check auth.uid() and organization inside, set fixed search_path, execute revoked from PUBLIC. No INSERT or UPDATE policies on tokens or queue_state. | One enforced write path; row locks and rules cannot be bypassed | Invoker functions with write policies |
| DEC-09 | queue_state.waiting_numbers holds array of waiting numbers | Browser computes people ahead exactly without reading tokens | Derive from counters |
| DEC-10 | New token status `expired` for tokens left over at day rollover | Explicit state for yesterday's tokens | Delete leftovers |
| DEC-11 | Day rollover is lazy: first issue or advance on new Asia/Dhaka day resets queue state | No scheduler needed for correctness | Midnight cron job |
| DEC-12 | Service-role client created in one file (`src/lib/supabase/service.ts`) and used by 4 server modules only | Keeps key's use auditable and restricted (SEC-07) | Wider use across handlers |
| DEC-13 | Push-subscribe rate limit is best effort (in-memory per server instance + platform limits) | Simple at this scale (SEC-08) | Database-backed limiter |
| DEC-14 | Admin creates staff with a random temporary password shown once to admin; staff then use password reset | No public sign-up (C-01); no email invitations to configure | Email invitation tokens |
| DEC-15 | Staff screen uses action responses, focus refresh and 10-second polling in Phase 5, switches to realtime in Phase 6 | Lets Phase 5 be tested without realtime hook | Realtime first |
| DEC-16 | Purge scheduling: Vercel Cron calling POST /api/internal/purge with CRON_SECRET header | Reliable across serverless without relying on pg_cron extension availability in free/paused DB tiers | Exclusive pg_cron dependency |
| DEC-17 | Two error codes added: `TOKEN_NOT_SKIPPED` and `ALREADY_RECALLED` (409) | Recall rules need clear error codes | Reuse `TOKEN_NOT_WAITING` |
| DEC-18 | A service duration under 20 seconds is not counted in the moving average (D-04) | Catch-up presses after outage should not distort average | Simple average of all completed |

---

## Realtime Spike Findings (Phase 2, DEC-03 Spike)

### Investigation & Verification
1. **Supabase Realtime Functions**:
   - `realtime.send(payload, event, topic, private)` sends arbitrary JSON data to the specified Realtime topic.
   - `realtime.broadcast_changes(topic, event, operation, table, schema, new_record, old_record)` formats payloads to match Postgres Changes replication.
   - For QueuePulse, `realtime.send` is optimal because it broadcasts a sanitized, curated payload containing counters only (`service_date`, `serving_number`, `last_issued`, `waiting_numbers`, `avg_service_minutes`, `status`, `version`), omitting internal IDs and personal information.

2. **Public Topics vs Private Channels (Authorization)**:
   - When the `private` parameter is `false`:
     - The channel is designated as **Public**.
     - Anonymous clients using only the project's anonymous public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) **can subscribe to the topic and receive broadcast messages without Realtime Authorization**.
     - No user session or RLS policies on the internal `realtime.messages` table are required for clients to subscribe and receive events.
   - When the `private` parameter is `true` (or omitted, as true is default):
     - The channel requires Realtime Authorization. Only authenticated clients with explicit `SELECT` policies on `realtime.messages` can join and receive messages.

3. **Conclusion for QueuePulse**:
   - Setting `private => false` in `realtime.send()` allows anonymous visitors to subscribe to `queue:<queue_id>` using only their anon key, satisfying **SEC-03** and **DEC-03** without requiring anonymous sign-ins or credentials.
   - On the client side, anonymous viewers configure channel subscription with `config: { private: false }`.

### Documentation Links
- [Supabase Broadcast from Database](https://supabase.com/docs/guides/realtime/broadcast-from-database)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)

---

## Purge Scheduling Resolution (Phase 7, DEC-16)

### Investigation & Choice
1. `pg_cron` availability in Supabase Cloud varies by plan and paused states (inactive projects pause scheduled background jobs).
2. On Vercel, Vercel Cron allows 1 daily scheduled invocation on the Hobby plan (`0 4 * * *`), which matches our 7-day PII purge requirement without external dependencies.
3. Therefore, `POST /api/internal/purge` protected by `CRON_SECRET` header was implemented and wired to `vercel.json` crons. If `pg_cron` is enabled locally or in self-hosted Postgres, `purge_expired_pii()` can also be invoked directly.
