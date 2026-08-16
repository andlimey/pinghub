import { randomUUID } from "node:crypto";
import type { Channel, NotificationRecord, SendNotificationRequest } from "./types.js";
import type { NotificationStore } from "./store.js";
import { channels } from "./channels/index.js";

const VALID_CHANNELS: Channel[] = ["sms", "email", "push"];
const REQUIRED_FIELDS = ["userId", "channel", "destination", "message"] as const;

export class ValidationError extends Error {}

export class NotificationService {
  constructor(private readonly store: NotificationStore) {}

  async send(request: SendNotificationRequest): Promise<NotificationRecord> {
    this.validate(request);

    const sender = channels[request.channel];
    const result = sender.send(request.destination, request.message, {
      simulateFailure: request.simulateFailure,
    });

    const record: NotificationRecord = {
      id: randomUUID(),
      userId: request.userId,
      channel: request.channel,
      destination: request.destination,
      message: request.message,
      status: result.success ? "delivered" : "failed",
      error: result.error,
      createdAt: new Date().toISOString(),
    };

    await this.store.save(record);
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
