## ADDED Requirements

### Requirement: Asynchronous notification acceptance
The system SHALL accept a notification request, validate it synchronously, persist it with status `queued`, enqueue a delivery job, and return a response before delivery is attempted.

#### Scenario: Valid request returns immediately with queued status
- **WHEN** a caller submits a valid notification request
- **THEN** the system responds with the notification `id` and status `queued` without waiting for the channel provider to respond

#### Scenario: Invalid request is rejected without enqueueing
- **WHEN** a caller submits a request with a missing required field or an invalid channel
- **THEN** the system responds with an error and does not create a delivery job

### Requirement: Notification status lifecycle
The system SHALL track each notification through the states `queued`, `processing`, `delivered`, and `failed`, reflecting the delivery job's progress.

#### Scenario: Worker starts processing a job
- **WHEN** the worker picks up a queued delivery job
- **THEN** the notification's status transitions to `processing` before the channel provider is called

#### Scenario: Delivery succeeds
- **WHEN** the channel provider reports a successful send
- **THEN** the notification's status transitions to `delivered`

#### Scenario: Delivery fails
- **WHEN** the channel provider reports a failed send, after any configured retries are exhausted
- **THEN** the notification's status transitions to `failed` and the failure reason is recorded

### Requirement: Retry policy for transient send failures
The system SHALL retry a delivery job that fails with a transient error a bounded number of times with backoff, and SHALL NOT retry requests that were never enqueued due to validation failure.

#### Scenario: Transient failure is retried
- **WHEN** a channel provider call fails with a transient error, such as a timeout or rate limit
- **THEN** the system retries the delivery job according to the configured retry policy before marking it `failed`

#### Scenario: Exhausted retries mark the notification failed
- **WHEN** a delivery job has failed all configured retry attempts
- **THEN** the notification's status transitions to `failed` with the last error recorded
