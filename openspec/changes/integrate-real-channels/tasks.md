## 1. Config layer

- [x] 1.1 Add a config module (`src/config.ts`) that reads `PORT`, `DATABASE_URL`, and `REDIS_URL` from the environment, with `dotenv` (or equivalent) loading a local `.env` in development
- [x] 1.2 Add `.env.example` documenting all required variables (including placeholders for provider credentials added in later phases)
- [x] 1.3 Add `.env` to `.gitignore`
- [x] 1.4 Update `src/index.ts` and any other ad hoc `process.env` reads to go through the config module
- [x] 1.5 Document the new configuration requirements in the README

## 2. Postgres-backed persistence

- [x] 2.1 Add a `docker-compose.yml` with a local Postgres service
- [x] 2.2 Add a Postgres client/query dependency
- [x] 2.3 Define the notifications table schema (id, userId, channel, destination, message, status, error, createdAt) and a migration/init step
- [x] 2.4 Implement a Postgres-backed `NotificationStore` behind the existing `save`/`get` interface, replacing the in-memory `Map`
- [x] 2.5 Wire `app.ts` to construct the Postgres-backed store instead of the in-memory one
- [x] 2.6 Update `store`/`notificationService` tests to run against a real (test) Postgres instance
- [x] 2.7 Update the README: local dev now requires `docker compose up` before `pnpm dev`

## 3. Async queue + worker

- [x] 3.1 Add `bullmq` and `ioredis` dependencies
- [x] 3.2 Add a Redis service to `docker-compose.yml`
- [x] 3.3 Expand `NotificationStatus` to `queued | processing | delivered | failed` in `src/types.ts`
- [x] 3.4 Create a queue module wrapping BullMQ, defining the delivery job name and payload shape
- [x] 3.5 Update `notificationService` so a valid request is validated synchronously, saved with status `queued`, and enqueued as a job — without waiting for delivery
- [x] 3.6 Update the `POST /notifications` route to respond `202` with `{ id, status }` immediately after enqueueing
- [x] 3.7 Create a worker entrypoint (`src/worker.ts`) as a process separate from `src/index.ts`
- [x] 3.8 Implement the worker's job processor: mark the record `processing`, call the (still-mocked) channel sender, then mark `delivered`/`failed`
- [x] 3.9 Configure a retry policy (`attempts`/backoff) on the queue for job failures, distinct from validation errors (which never reach the queue)
- [x] 3.10 Add a `worker` script to `package.json` alongside `dev`/`start`
- [x] 3.11 Add/update tests covering the async flow — enqueue, worker processing, status transitions — against the mock channels
- [x] 3.12 Update the Bruno collection for the new `202` response and a status-polling step
- [x] 3.13 Update the README's architecture and data-flow sections for the async model

## 4. Email via Resend

- [ ] 4.1 Add the `resend` dependency
- [ ] 4.2 Add `RESEND_API_KEY` to the config module and `.env.example`
- [ ] 4.3 Implement the real Resend call in `src/channels/email.ts`, now async, behind the existing `ChannelSender` contract
- [ ] 4.4 Update the email channel test to cover the real integration (mocking the Resend client) while keeping the success/failure contract intact
- [ ] 4.5 Manually verify one real end-to-end email send

## 5. Push via Firebase Cloud Messaging

- [ ] 5.1 Add the `firebase-admin` dependency
- [ ] 5.2 Add Firebase service account credentials to the config module and `.env.example`
- [ ] 5.3 Implement the real FCM call in `src/channels/push.ts`
- [ ] 5.4 Document the hardcoded test device token used as the destination stand-in, and the absence of a device directory, as a named and accepted gap
- [ ] 5.5 Update the push channel test to cover the real integration (mocking the Admin SDK) while keeping the success/failure contract intact
- [ ] 5.6 Manually verify one real end-to-end push send against a test device token

## 6. SMS via Twilio

- [ ] 6.1 Add the `twilio` dependency
- [ ] 6.2 Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` to the config module and `.env.example`
- [ ] 6.3 Implement the real Twilio call in `src/channels/sms.ts`
- [ ] 6.4 Update the SMS channel test to cover the real integration (mocking the Twilio client) while keeping the success/failure contract intact
- [ ] 6.5 Manually verify one real end-to-end SMS send against Twilio trial/sandbox credentials
- [ ] 6.6 Note production A2P registration (10DLC or toll-free verification) as a tracked follow-up outside this change's code scope
