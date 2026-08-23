## Why

PingHub's channel integrations are currently mocked (`console.log` stand-ins that always succeed unless a caller opts into `simulateFailure`). To be more than a demo, it needs to actually deliver SMS/email/push through real providers. Doing that synchronously would block the API on slow or unreliable third-party network calls and would leave notification status unqueryable whenever a provider is degraded or rate-limited — so delivery needs to move to an async, queue-based model where status stays available independent of provider health.

## What Changes

- Replace the mocked SMS/email/push senders with real provider integrations: Twilio (SMS), Resend (email), Firebase Cloud Messaging (push, direct via Admin SDK).
- **BREAKING**: `POST /notifications` no longer returns a resolved `delivered`/`failed` record synchronously. It returns `202` with `{ id, status: "queued" }` once validation passes; callers poll `GET /notifications/:id` for the outcome.
- Introduce an async job queue (BullMQ + Redis). A notification send becomes a job; a **separate worker process** (not in-process with the API — the API and worker are intended to be deployed and scaled independently) picks it up and performs the real channel call.
- Expand `NotificationStatus` from `delivered | failed` to `queued | processing | delivered | failed`. The worker writes `processing` when it picks up a job, then `delivered`/`failed` on completion.
- Add a retry policy for transient send failures (timeouts, provider rate limits), distinct from validation failures — a missing field or invalid channel is still rejected synchronously, before a job is ever enqueued, and never retries.
- Replace the in-memory `NotificationStore` `Map` with a Postgres-backed implementation, so notification history survives restarts and is visible to both the API and worker processes (which no longer share memory). Local development runs Postgres via Docker.
- Add an environment-based configuration layer (`DATABASE_URL`, `REDIS_URL`, provider credentials) — the project currently has none; connection details are read from config rather than hardcoded, both for basic hygiene and so a later swap to hosted Postgres/Redis is a config change, not a code change.

**Explicitly out of scope for this change**: DB/queue high availability (read replicas, standby instances, automatic failover) and hosted infrastructure (Supabase, hosted Redis). Those are deferred to when the service is actually deployed somewhere that charges for hosting anyway. This change only guarantees the architecture doesn't foreclose adding them later (stateless API, externalized config) — it does not build or run them.

## Capabilities

### New Capabilities
- `notification-delivery`: async, queue-based dispatch of a notification to its channel — the `queued → processing → delivered/failed` lifecycle, job enqueueing, and the retry policy for transient send failures.
- `channel-providers`: real per-channel send integrations (Twilio SMS, Resend email, FCM push) that replace the mocked senders, each conforming to the existing `ChannelSender` contract (now async).
- `notification-persistence`: durable, DB-backed storage of notification records such that status remains queryable regardless of channel-provider or queue availability.

### Modified Capabilities
None — this is the first change in this project's OpenSpec history; there are no existing specs to modify.

## Impact

- **Code**: `src/notificationService.ts` and `src/routes.ts` (async flow, `202` response contract), `src/channels/*.ts` (real provider calls replace mock bodies), `src/store.ts` (Postgres-backed implementation), `src/types.ts` (`NotificationStatus` union).
- **New modules**: a worker process entrypoint (separate from `src/index.ts`), a queue module wrapping BullMQ, a config module for environment variables.
- **New dependencies**: `bullmq`, `ioredis`, a Postgres client/query layer, `resend`, `twilio`, `firebase-admin`.
- **New local infra**: Docker Compose (or equivalent) for Postgres + Redis in development.
- **`package.json`**: a new `worker` script alongside the existing `dev`/`start`.
- **API contract**: `POST /notifications` response shape and status code change (breaking for any existing caller expecting a synchronously resolved record).
