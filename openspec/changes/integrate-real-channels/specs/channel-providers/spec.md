## ADDED Requirements

### Requirement: Email delivery via Resend
The system SHALL deliver `email` channel notifications through the Resend API.

#### Scenario: Successful email send
- **WHEN** a queued notification with channel `email` is processed
- **THEN** the system calls the Resend API with the destination address and message, and records success on a successful response

#### Scenario: Failed email send
- **WHEN** the Resend API returns an error for a send attempt
- **THEN** the system records the failure reason returned by Resend

### Requirement: Push delivery via Firebase Cloud Messaging
The system SHALL deliver `push` channel notifications through Firebase Cloud Messaging.

#### Scenario: Successful push send
- **WHEN** a queued notification with channel `push` is processed
- **THEN** the system calls Firebase Cloud Messaging with the destination device token and message, and records success on a successful response

#### Scenario: Failed push send
- **WHEN** Firebase Cloud Messaging returns an error for a send attempt, such as an invalid or expired token
- **THEN** the system records the failure reason returned by Firebase Cloud Messaging

### Requirement: SMS delivery via Twilio
The system SHALL deliver `sms` channel notifications through the Twilio API.

#### Scenario: Successful SMS send
- **WHEN** a queued notification with channel `sms` is processed
- **THEN** the system calls the Twilio API with the destination phone number and message, and records success on a successful response

#### Scenario: Failed SMS send
- **WHEN** the Twilio API returns an error for a send attempt
- **THEN** the system records the failure reason returned by Twilio

### Requirement: Common asynchronous send contract across channels
Each channel provider integration SHALL implement the same asynchronous send contract, so the delivery pipeline can dispatch to any channel without channel-specific logic outside that channel's own module.

#### Scenario: Delivery pipeline dispatches without channel-specific branching
- **WHEN** the worker processes a job for any supported channel
- **THEN** it invokes the same send contract regardless of which channel is used, with all channel-specific provider logic contained within that channel's module
