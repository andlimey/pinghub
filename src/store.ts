import type { NotificationRecord } from "./types.js";

/** In-memory notification history. Resets on process restart. */
export class NotificationStore {
  private readonly records = new Map<string, NotificationRecord>();

  save(record: NotificationRecord): void {
    this.records.set(record.id, record);
  }

  get(id: string): NotificationRecord | undefined {
    return this.records.get(id);
  }
}
