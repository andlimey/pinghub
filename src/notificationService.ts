import { randomUUID } from "node:crypto";
import type { Channel, NotificationRecord, SendNotificationRequest } from "./types.js";
import type { NotificationStore } from "./store.js";
import { DELIVERY_JOB_NAME, type DeliveryJobData } from "./queue.js";

const VALID_CHANNELS: Channel[] = ["sms", "email", "push"];
const REQUIRED_FIELDS = ["userId", "channel", "destination", "message"] as const;

export class ValidationError extends Error {}

/** The subset of BullMQ's `Queue` API `NotificationService` needs — kept minimal so tests can stub it. */
export interface DeliveryQueue {
  add(name: string, data: DeliveryJobData): Promise<unknown>;
}

export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly queue: DeliveryQueue
  ) {}

  async send(request: SendNotificationRequest): Promise<NotificationRecord> {
    this.validate(request);

    const record: NotificationRecord = {
      id: randomUUID(),
      userId: request.userId,
      channel: request.channel,
      destination: request.destination,
      message: request.message,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    await this.store.save(record);
    await this.queue.add(DELIVERY_JOB_NAME, {
      notificationId: record.id,
      simulateFailure: request.simulateFailure,
    });

    return record;
  }

  getById(id: string): Promise<NotificationRecord | undefined> {
    return this.store.get(id);
  }

  private validate(request: SendNotificationRequest): void {
    const missing = REQUIRED_FIELDS.filter((field) => !request?.[field]);
    if (missing.length > 0) {
      throw new ValidationError(`Missing required field(s): ${missing.join(", ")}`);
    }
    if (!VALID_CHANNELS.includes(request.channel)) {
      throw new ValidationError(
        `Invalid channel "${request.channel}". Must be one of: ${VALID_CHANNELS.join(", ")}`
      );
    }
  }
}
