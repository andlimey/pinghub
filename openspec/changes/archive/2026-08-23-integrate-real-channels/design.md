## Context

PingHub's `ChannelSender` interface (`send(destination, message, opts) -> ChannelSendResult`) is currently implemented by three mock modules that `console.log` and return success unless `simulateFailure` is set. The service (`notificationService.ts`) calls `sender.send()` synchronously, builds a resolved `NotificationRecord`, and returns it from `POST /notifications` in the same request. History lives in an in-memory `Map` (`NotificationStore`), explicitly built as an isolated, swappable class for exactly this future change.

Real providers are network calls, not `console.log`. Calling them synchronously from the request handler would (a) block the response on third-party latency and (b) mean a provider outage or rate limit makes `GET /notifications/:id` itself unreliable, since a slow/failed send would delay or fail the very request meant to record it. The core design move is decoupling *accepting* a notification from *delivering* it, via a job queue, so status querying never depends on provider health.

## Goals / Non-Goals

**Goals:**
- Replace mocked SMS/email/push with real delivery via Twilio, Resend, and Firebase Cloud Messaging.
- `GET /notifications/:id` stays available and accurate even when a channel provider is down, rate-limited, or slow.
- Delivery work is decoupled from the HTTP request/response cycle via an async job queue and a separate worker process.
- Notification history is durable (survives process restarts) and visible to both the API and worker processes.
- The work ships incrementally — each phase leaves the system fully working before the next begins, per explicit request to avoid a big-bang implementation.
- The architecture doesn't foreclose adding real high availability (DB replicas, redundant API instances, queue failover) later — stateless services, externalized config — without requiring it now.

**Non-Goals:**
- Building or running any DB/queue redundancy (replicas, standby instances, automatic failover) — deferred until the service is deployed somewhere that charges for hosting anyway.
- Migrating to hosted infrastructure (Supabase, hosted Redis) — local Docker Postgres/Redis only, for this change.
- A user/device directory. Push still needs a destination; this change accepts a hardcoded test FCM token as a stand-in, the same way SMS/email accept a caller-supplied phone number or address.
- Message templating, per-user channel preference/routing, rate limiting, authentication — unchanged from the existing MVP's documented scope.
- Automating SMS carrier registration (US 10DLC / toll-free verification). That's an external, account-level process handled outside this codebase; this change only needs Twilio's API to work once registration is in place (or against trial/sandbox in the meantime).

## Decisions

**1. Async delivery via a job queue (BullMQ + Redis), not an async/await chain up the HTTP stack.**
Making `sender.send()` a `Promise` and `await`-ing it through `notificationService.send()` and the route handler would technically work, but it keeps delivery latency (and provider outages) directly in the request/response path — the exact problem this change exists to avoid. A queue means `POST /notifications` does only synchronous validation + a store write + an enqueue, then returns immediately. Delivery happens later, out of band, and never blocks or breaks a status read.

**2. A separate worker process, not a same-process `Worker` instance.**
BullMQ supports running `Queue` and `Worker` in the same Node process, which would be simpler for a pet project. Rejected because the API and worker are intended to be deployed and scaled independently later — building that separation now means the eventual deploy is a packaging change, not a re-architecture. The trade-off, accepted deliberately: the in-memory `NotificationStore` can no longer work (see Decision 3), since two processes don't share memory.

**3. `NotificationStore` becomes Postgres-backed. Redis/BullMQ job state is explicitly rejected as the source of truth for status.**
Two options were considered and rejected in favor of a real DB:
  - *Redis-backed `NotificationStore`* (keep the interface, change only the backing store) — rejected because hosted free-tier Redis (the intended eventual target) uses random eviction once the memory cap is hit, not LRU or oldest-first. Under memory pressure, a notification's status could simply disappear, non-deterministically — unacceptable for "the user should always be able to query status."
  - *BullMQ job state as the record* (`GET /notifications/:id` → `queue.getJob(id)`, no separate store) — rejected for the same durability reason, plus it couples "how long we remember a notification" to queue retention settings (`removeOnComplete`/`removeOnFail`), which exist to bound Redis memory for queue health, not to serve as a product decision about notification history.

  Postgres avoids both problems and is exactly the swap `NotificationStore`'s interface (`save`/`get`) was already designed to absorb without touching the service or routes.

**4. Local development runs Postgres via Docker, not SQLite.**
SQLite was considered as the simpler zero-infra option for local dev. Rejected specifically because of Decision 2: the API and worker are separate processes writing to the same store concurrently, and SQLite's single-writer file lock doesn't rehearse that concurrency pattern the way Postgres's row-level locking does — dev would silently diverge from the concurrent-write behavior of both local Docker Postgres now and hosted Postgres (Supabase) later. Running the same database engine in dev and in the eventual hosted target was judged more valuable than SQLite's lower setup cost.

**5. `NotificationStatus` gains `queued` and `processing`.**
Final shape: `queued | processing | delivered | failed`. The worker writes `processing` at the moment it picks up a job (before calling the channel), and `delivered`/`failed` on completion. This gives callers a visible "a worker has started on this" signal distinct from "still sitting in the queue," useful for diagnosing a stuck worker vs. a backed-up queue.

**6. Retries apply only to genuine send failures, never to validation failures.**
Validation (missing field, invalid channel) still happens synchronously in the route/service layer, before anything is enqueued — a bad request never becomes a job and never retries. BullMQ's `attempts`/`backoff` options wrap only the channel `send()` call inside the worker, covering transient failures (timeouts, provider rate limits/5xx). This fulfills the retry work the original README explicitly deferred ("can be added later as a wrapper around `ChannelSender.send()`") without expanding scope beyond what was already planned.

**7. All new infrastructure connection details come from environment configuration, not hardcoded values.**
`DATABASE_URL`, `REDIS_URL`, and per-provider credentials (Resend API key, Twilio SID/auth token, Firebase service account) are read from environment/config, introducing the config layer the project currently lacks. This is what makes the later swap to hosted Postgres/Redis (and eventually DB replicas or Redis failover) a configuration change instead of a code change — the concrete, actionable consequence of the "design for availability, don't build it yet" decision from the proposal.

**8. Provider selection: Resend (email), Firebase Cloud Messaging (push, direct via Admin SDK), Twilio (SMS).**
Carried forward from prior exploration: Resend for a genuine, generous free tier with a clean async API; FCM because it's free and unlimited with no tier to reason about; Twilio for maturity and documentation depth, accepting 10DLC/toll-free registration friction as a known, external cost of doing real A2P SMS delivery. (textbee.dev was considered and rejected as the SMS option — its reliability is bounded by a physical Android device staying powered and connected, which is a meaningfully lower availability bar than a carrier API, in tension with this change's core goal.)

## Risks / Trade-offs

- **[Risk]** `POST /notifications`'s response contract changes from a resolved record to `202 { id, status: "queued" }` — breaking for any existing caller. → **Mitigation**: no external callers exist yet (pet project, pre-1.0); update the Bruno collection and README alongside the change so the documented contract and the real one never drift.
- **[Risk]** Local development now requires Docker for both Postgres and Redis, up from zero infrastructure today. → **Mitigation**: a single `docker-compose.yml` bringing up both, documented as one command in the README.
- **[Risk]** A separate worker process introduces a new failure mode not possible today: the worker can be down while the API keeps accepting and enqueueing notifications, which then pile up unprocessed. → **Mitigation**: explicitly accepted for this change's scope (see Non-Goals — no HA/redundancy yet); revisit if queue backlash becomes a real problem worth solving rather than a theoretical one.
- **[Risk]** SMS delivery depends on Twilio account-level registration (10DLC or toll-free verification) that is slow and entirely outside this codebase's control. → **Materialized**: phase 6 was built and unit-tested against a mocked Twilio client, but real end-to-end verification hit a blocker beyond the anticipated 10DLC scope — the only available test destination is a Singapore number, and Singapore's IMDA SMS Sender ID Registry requires a registered alphanumeric Sender ID before *any* provider (not just Twilio) can deliver to a Singapore number. Registration needs local business documentation, outside this project's scope. **Decision**: phase 6 reverted; `src/channels/sms.ts` stays mocked until either the registration is completed or a non-Singapore test destination is available. See the "SMS delivery" row in the README's Design decisions table.
- **[Risk]** The FCM push destination is a hardcoded test device token, not a real per-user registry. → **Mitigation**: named and accepted as a gap for this change; a device/user directory is future scope, consistent with PingHub's existing "no user directory" design decision for destinations generally.

## Migration Plan

Delivered as six independently-working phases, in this order, each committed/shipped before the next begins:

1. **Config layer** — introduce environment-based configuration (`DATABASE_URL`, `REDIS_URL`, provider credentials). No behavior change; nothing reads these values yet.
2. **Postgres-backed persistence** — swap `NotificationStore`'s implementation from the in-memory `Map` to Postgres (local via Docker). Channels remain mocked; the request/response flow remains fully synchronous. Proves the persistence seam in isolation.
3. **Async queue + worker** — introduce BullMQ + Redis (local via Docker) and a separate worker process; expand `NotificationStatus`; change `POST /notifications` to `202` with immediate return. The worker still dispatches to the existing *mock* channel senders. Proves the queue/worker/status-polling mechanics without also debugging a real provider integration at the same time.
4. **Resend (email)** — swap the mock email sender for a real, now-async Resend call.
5. **Firebase Cloud Messaging (push)** — swap the mock push sender for a real FCM send via the Admin SDK.
6. **Twilio (SMS)** — swap the mock SMS sender for a real Twilio call. **Reverted**: built and unit-tested, but real verification is blocked by Singapore's IMDA Sender ID registration requirement (see Risks). `src/channels/sms.ts` remains mocked; tasks 6.1–6.6 are unchecked pending either that registration or a non-Singapore test destination.

Each of phases 4–6 touches exactly one file behind the unchanged `ChannelSender` interface and is independent of the other two — they can ship in any relative order or even be reordered if a provider's setup (e.g., Twilio registration) takes longer than expected, without blocking the others.

Rollback, if needed at any phase: each phase is a separable commit; reverting one doesn't require unwinding the phases before it, since each phase leaves the system in a fully working state on its own.

## Open Questions

- Exact BullMQ `attempts`/`backoff` values (how many retries, what delay curve) — left to implementation time in phase 3, tunable per observed provider behavior once phases 4–6 are live.
- Whether `processing` (vs. just `queued` → `delivered`/`failed`) earns its keep in practice, or whether the extra store write it costs isn't worth the signal for a pet project — kept as decided for now, revisit if it proves to add no observable value during phase 3.
- Relative order of phases 4–6 may shift based on how long Twilio's account registration actually takes in practice — the design doesn't depend on a specific order among them.
