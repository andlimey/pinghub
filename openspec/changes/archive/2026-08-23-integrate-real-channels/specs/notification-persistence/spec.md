## ADDED Requirements

### Requirement: Durable notification records
The system SHALL persist notification records in a database that survives process restarts and is shared between the API and worker processes.

#### Scenario: Record survives a process restart
- **WHEN** the API or worker process restarts after a notification has been recorded
- **THEN** a subsequent status query for that notification still returns its last known status

#### Scenario: Record is visible across processes
- **WHEN** the worker updates a notification's status
- **THEN** the API process can read that updated status immediately via `GET /notifications/:id`

### Requirement: Status queries independent of channel-provider and queue availability
The system SHALL serve notification status queries directly from the persistent store, without depending on a live call to a channel provider or the job queue.

#### Scenario: Status query succeeds during a provider outage
- **WHEN** a channel provider is unreachable, rate-limited, or erroring
- **THEN** `GET /notifications/:id` for previously submitted notifications still returns their current status without error

#### Scenario: Status query does not require the queue to be reachable
- **WHEN** the job queue or its backing Redis instance is temporarily unavailable
- **THEN** `GET /notifications/:id` for previously submitted notifications still returns their current status from the persistent store
