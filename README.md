# PingHub

PingHub is a shared notification service: instead of every app writing its
own email/SMS/push integration code, they call PingHub — "send this to this
user" — and PingHub picks the channel, delivers it, and remembers what
happened.

This is a learning-focused MVP for system design, not a production service.
The channel integrations (SMS/email/push) are mocked. Scope was deliberately
kept small so the orchestration logic (validation → dispatch → record) stays
hand-written and visible rather than delegated to a framework.

## Design decisions

These were made deliberately, in this order of priority, and are recorded
here so a future session doesn't "fix" them without knowing why:

| Decision | Choice | Why |
|---|---|---|
| Stack | Node + TypeScript + Express | Matches the pnpm/JS convention already established for this user's projects. Express (not Rails/Sinatra) was picked over a fuller framework so the retry/dispatch/history mechanics are hand-built rather than hidden behind convention — that's the actual learning content. |
| Channel selection | Caller specifies the channel explicitly in the request | No preference store, no fallback logic. Simplest possible API; "picking the channel" for the caller is a feature that can be layered on later without changing the core send/record flow. |
| Retries | Bounded retries with exponential backoff, applied only to delivery jobs (never to validation failures) | A missing field or invalid channel is rejected synchronously and never becomes a job. Once a job exists, transient send failures (timeouts, rate limits) get retried by the queue before the notification is marked `failed`. |
| Delivery model | Async, queue-based. `POST /notifications` validates and enqueues, then returns immediately; a separate worker process performs the actual channel call | Decouples accepting a notification from delivering it, so a slow/degraded provider never blocks the API or makes `GET /notifications/:id` unreliable. The API and worker are independent processes so they can be deployed and scaled separately later. |
| Persistence | Postgres-backed `NotificationStore`, run locally via Docker Compose | Notification history survives restarts and is visible to both the API and worker processes, which no longer share memory. `NotificationStore` kept the same `save`/`get` interface it was originally built with, so the service and routes needed no changes to absorb the swap from the original in-memory `Map`. |
| Message rendering | Caller sends final message text | No templating layer. PingHub only routes and delivers; rendering is out of scope for this MVP. |
| Destination / contact info | Caller includes it directly in the request (e.g. `destination: "a@b.com"`) | No user directory. Avoids building user-management just to demo delivery. |
| Mock failure | Caller can force a failure via `simulateFailure: true` in the request | Deterministic and testable, unlike random failure — lets you exercise the "failed" status path on demand instead of hoping for bad luck. |
| API surface | `POST /notifications` + `GET /notifications/:id` | Minimal surface covering "send" and "check what happened." No list/browse endpoint yet. |

**Deliberately out of scope for this iteration**: a per-user
channel-preference store, message templating, a `GET /notifications` list
endpoint, authentication (single company/tenant is assumed), and rate
limiting.

## Architecture

```
src/
  types.ts               Shared types: Channel, NotificationRecord, ChannelSender interface
  config.ts               Environment-based configuration (PORT, DATABASE_URL, REDIS_URL, ...)
  db.ts                    Postgres connection pool + schema migration
  store.ts                NotificationStore — Postgres-backed history (save/get)
  redis.ts                 Shared ioredis connection, used by the BullMQ queue and worker
  queue.ts                 BullMQ queue definition: job name, payload shape, retry policy
  channels/
    sms.ts, email.ts, push.ts   Mock channel integrations, each implementing ChannelSender
    index.ts               Maps Channel -> the corresponding mock sender
  notificationService.ts   Orchestrator: validates the request, saves it as `queued`,
                            and enqueues a delivery job — does not wait for delivery
  routes.ts                Express routes, translates service outcomes to HTTP responses
  app.ts                   Builds the Express app (wires store -> queue -> service -> routes)
  index.ts                 API entrypoint: starts the HTTP server
  worker.ts                 Worker entrypoint (separate process): consumes delivery jobs,
                            dispatches to the channel, updates status
```

Each mock channel module implements the same `ChannelSender` interface
(`send(destination, message, opts) -> { success, error? }`), so swapping in a
real Twilio/SES/FCM integration later means replacing the body of one file —
everything upstream of `channels/` is unaffected.

### Data flow

The API (`src/index.ts`) and the worker (`src/worker.ts`) are separate
processes, connected only through Postgres (shared state) and Redis (the job
queue) — not through memory.

1. Caller `POST`s `{ userId, channel, destination, message, simulateFailure? }`
   to `/notifications`.
2. `NotificationService` validates required fields and that `channel` is one
   of `sms | email | push` (throws `ValidationError` → HTTP 400 otherwise).
   A request that fails validation is never saved and never becomes a job.
3. For a valid request, the service generates an `id`, saves a
   `NotificationRecord` with `status: "queued"` to Postgres, and enqueues a
   BullMQ delivery job carrying the notification's id (and `simulateFailure`,
   which only exists to exercise the mock channels). It does not wait for
   delivery. The route responds `202` with `{ id, status: "queued" }`.
4. The worker process picks up the job, marks the record `processing`, then
   calls the matching mock channel module. The mock succeeds unless
   `simulateFailure: true` was passed, in which case it returns a
   channel-specific simulated error.
5. On success, the worker marks the record `delivered`. On failure, BullMQ
   retries the job (3 attempts, exponential backoff) before the worker marks
   it `failed` with the error, once retries are exhausted.
6. `GET /notifications/:id` reads directly from Postgres and returns the
   record's current status (`queued | processing | delivered | failed`), or
   `404` if the id is unknown — independent of whether the worker or a
   channel provider is currently healthy.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No (default `3000`) | HTTP port the API listens on |
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_URL` | Yes | Redis connection string, used by the BullMQ job queue |
| `RESEND_API_KEY` | Phase 4+ | Resend API key for email delivery |
| `FIREBASE_SERVICE_ACCOUNT` | Phase 5+ | Firebase service account (path or JSON) for push delivery |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Phase 6+ | Twilio credentials for SMS delivery |

`src/config.ts` loads `.env` via `dotenv` in development and is the only place
that reads `process.env` — everything else imports `config` from there.
`DATABASE_URL` and `REDIS_URL` are required at startup even before the
Postgres/Redis-backed code that uses them ships, so set them in `.env` before
running `pnpm dev`.

## Running it

Local dev requires Postgres and Redis, both run via Docker Compose, plus the
worker running alongside the API — notifications are only accepted and
persisted by the API; they're actually delivered by the worker.

```bash
docker compose up -d      # starts local Postgres + Redis, once, before the app
pnpm install
pnpm dev          # API with auto-reload (tsx watch)
pnpm worker       # worker process — run this too, or nothing gets delivered
pnpm start        # API without watch
pnpm build        # typecheck + compile src/ to dist/
pnpm typecheck     # typecheck src/ and test/ together, no emit
pnpm test          # run the vitest suite (also needs Postgres + Redis running)
```

The API listens on `PORT` (default `3000`); the worker has no listening
port, it just connects to Postgres and Redis. The `notifications` table is
created automatically on first connection (see `src/db.ts`); the same
schema is also applied via `db/init.sql` on the container's first boot.

## API reference

### `POST /notifications`

Request body:

```json
{
  "userId": "user-123",
  "channel": "email",
  "destination": "andy@example.com",
  "message": "Hello from PingHub!",
  "simulateFailure": false
}
```

`channel` must be one of `sms`, `email`, `push`. `simulateFailure` is
optional and only exists to exercise the failure path on demand.

Delivery is async — this endpoint does not wait for it. Poll
`GET /notifications/:id` for the outcome.

Responses:
- `202` — `{ "id": "...", "status": "queued" }`.
- `400` — `{ "error": "..." }` for missing fields or an invalid channel.
  Nothing is saved and no delivery job is created.

### `GET /notifications/:id`

Responses:
- `200` — the `NotificationRecord` (see `src/types.ts`), `status` is
  `"queued"`, `"processing"`, `"delivered"`, or `"failed"`.
- `404` — `{ "error": "Notification not found" }`.

## Querying with Bruno

A ready-to-use [Bruno](https://www.usebruno.com/) collection lives in
[`bruno/`](bruno/). Open that folder as a collection in the Bruno app (or run
it headlessly), select the **Local** environment (`baseUrl` =
`http://localhost:3000`), and run requests in order. Both the API and the
worker need to be running for the status-polling steps to show a settled
outcome.

1. **Send Notification (Email - Success)** — responds `202 queued`; captures
   the returned `id` into the `notificationId` collection variable via a
   post-response script.
2. **Send Notification (SMS - Simulated Failure)** — also responds
   `202 queued` (delivery is async); captures its `id` into
   `failedNotificationId`. The worker will retry it and eventually mark it
   `failed`.
3. **Send Notification (Invalid Channel - 400)** — demonstrates synchronous
   validation; nothing is enqueued.
4. **Get Notification Status** — polls `{{notificationId}}`, set by request 1;
   settles on `delivered` once the worker has processed it.
5. **Get Notification Status (Failed)** — polls `{{failedNotificationId}}`,
   set by request 2; settles on `failed` once the worker's retries are
   exhausted.
6. **Get Notification Status (Not Found - 404)**.

Headlessly, with the dev server and worker both running:

```bash
cd bruno
npx @usebruno/cli run --env Local -r
```

## Testing

- `test/channels.test.ts` — each mock channel succeeds by default and fails
  when `simulateFailure` is set.
- `test/notificationService.test.ts` — validation and orchestration
  (queued status, job enqueued with the right payload), independent of HTTP,
  using a stub queue. Runs against the real local Postgres instance
  (`docker compose up -d` must be running).
- `test/worker.test.ts` — the worker's job processor (`deliverNotification`)
  called directly: `processing` → `delivered`/`failed` transitions, and the
  retry-vs-final-attempt branch, against real Postgres.
- `test/asyncDelivery.test.ts` — end-to-end through the real BullMQ queue and
  a real worker instance: enqueue a job, poll Postgres until the status
  settles. Requires Postgres and Redis both running.
- `test/app.test.ts` — integration tests over the Express routes via
  `supertest`, including the `202 queued` contract. Requires Postgres and
  Redis running.
