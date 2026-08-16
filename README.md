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
| Retries | None — single delivery attempt, outcome recorded either way | Explicitly deferred. "Remembering what happened" (the history/status API) was judged more foundational to build first; retry logic can be added later as a wrapper around the existing `ChannelSender.send()` call in `notificationService.ts` without changing its interface. |
| Persistence | Postgres-backed `NotificationStore`, run locally via Docker Compose | Notification history survives restarts. `NotificationStore` kept the same `save`/`get` interface it was originally built with, so the service and routes needed no changes to absorb the swap from the original in-memory `Map`. |
| Message rendering | Caller sends final message text | No templating layer. PingHub only routes and delivers; rendering is out of scope for this MVP. |
| Destination / contact info | Caller includes it directly in the request (e.g. `destination: "a@b.com"`) | No user directory. Avoids building user-management just to demo delivery. |
| Mock failure | Caller can force a failure via `simulateFailure: true` in the request | Deterministic and testable, unlike random failure — lets you exercise the "failed" status path on demand instead of hoping for bad luck. |
| API surface | `POST /notifications` + `GET /notifications/:id` | Minimal surface covering "send" and "check what happened." No list/browse endpoint yet. |

**Deliberately out of scope for this iteration**: retries/backoff, a
per-user channel-preference store, message templating,
a `GET /notifications` list endpoint, authentication (single company/tenant
is assumed), and rate limiting.

## Architecture

```
src/
  types.ts               Shared types: Channel, NotificationRecord, ChannelSender interface
  config.ts               Environment-based configuration (PORT, DATABASE_URL, REDIS_URL, ...)
  db.ts                    Postgres connection pool + schema migration
  store.ts                NotificationStore — Postgres-backed history (save/get)
  channels/
    sms.ts, email.ts, push.ts   Mock channel integrations, each implementing ChannelSender
    index.ts               Maps Channel -> the corresponding mock sender
  notificationService.ts   Orchestrator: validates the request, dispatches to a channel,
                            builds and stores the NotificationRecord
  routes.ts                Express routes, translates service outcomes to HTTP responses
  app.ts                   Builds the Express app (wires store -> service -> routes)
  index.ts                 Entrypoint: starts the HTTP server
```

Each mock channel module implements the same `ChannelSender` interface
(`send(destination, message, opts) -> { success, error? }`), so swapping in a
real Twilio/SES/FCM integration later means replacing the body of one file —
`notificationService.ts` and everything upstream is unaffected.

### Data flow

1. Caller `POST`s `{ userId, channel, destination, message, simulateFailure? }`
   to `/notifications`.
2. `NotificationService` validates required fields and that `channel` is one
   of `sms | email | push` (throws `ValidationError` → HTTP 400 otherwise).
3. The service dispatches to the matching mock channel module. The mock
   succeeds unless `simulateFailure: true` was passed, in which case it
   returns a channel-specific simulated error.
4. The service builds a `NotificationRecord` (with a generated `id`,
   `status: "delivered" | "failed"`, and `error` if failed), saves it to the
   Postgres-backed store, and returns it. The route responds `201`.
5. `GET /notifications/:id` looks up and returns the record, or `404` if the
   id is unknown.

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

Local dev requires Postgres, run via Docker Compose:

```bash
docker compose up -d      # starts local Postgres, once, before the app
pnpm install
pnpm dev          # start with auto-reload (tsx watch)
pnpm start        # start without watch
pnpm build        # typecheck + compile src/ to dist/
pnpm typecheck     # typecheck src/ and test/ together, no emit
pnpm test          # run the vitest suite (also needs Postgres running)
```

The server listens on `PORT` (default `3000`). The `notifications` table is
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

Responses:
- `201` — `NotificationRecord` (see `src/types.ts`), `status` is
  `"delivered"` or `"failed"`.
- `400` — `{ "error": "..." }` for missing fields or an invalid channel.

### `GET /notifications/:id`

Responses:
- `200` — the `NotificationRecord`.
- `404` — `{ "error": "Notification not found" }`.

## Querying with Bruno

A ready-to-use [Bruno](https://www.usebruno.com/) collection lives in
[`bruno/`](bruno/). Open that folder as a collection in the Bruno app (or run
it headlessly), select the **Local** environment (`baseUrl` =
`http://localhost:3000`), and run requests in order:

1. **Send Notification (Email - Success)** — also captures the returned
   `id` into the `notificationId` collection variable via a post-response
   script.
2. **Send Notification (SMS - Simulated Failure)** — demonstrates the
   `failed` status path.
3. **Send Notification (Invalid Channel - 400)** — demonstrates validation.
4. **Get Notification Status** — reads `{{notificationId}}`, set by request 1.
5. **Get Notification Status (Not Found - 404)**.

Headlessly, with the dev server running:

```bash
cd bruno
npx @usebruno/cli run --env Local -r
```

## Testing

- `test/channels.test.ts` — each mock channel succeeds by default and fails
  when `simulateFailure` is set.
- `test/notificationService.test.ts` — validation, dispatch, and store
  interaction, independent of HTTP. Runs against the real local Postgres
  instance (`docker compose up -d` must be running).
- `test/app.test.ts` — integration tests over the Express routes via
  `supertest`. Also requires local Postgres to be running.
