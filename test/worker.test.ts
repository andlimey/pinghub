import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { deliverNotification } from "../src/worker.js";
import { NotificationStore } from "../src/store.js";
import type { Channel, NotificationRecord } from "../src/types.js";
import { pool } from "../src/db.js";

describe("deliverNotification", () => {
  const store = new NotificationStore();

  afterAll(async () => {
    await pool.end();
  });

  async function seedQueued(channel: Channel): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      id: randomUUID(),
      userId: "user-1",
      channel,
      destination: "dest",
      message: "hi",
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    await store.save(record);
    return record;
  }

  it("marks the record processing then delivered on a successful send", async () => {
    // "push" and "sms" stay pure mocks; "email" now makes a real Resend call
    // (covered separately in emailChannel.test.ts) so it's excluded here.
    const record = await seedQueued("push");

    await deliverNotification(
      store,
      { notificationId: record.id },
      { attemptsMade: 0, maxAttempts: 1 }
    );

    const updated = await store.get(record.id);
    expect(updated?.status).toBe("delivered");
    expect(updated?.error).toBeUndefined();
  });

  it("leaves the record processing and retries (rethrows) when a send fails before the final attempt", async () => {
    const record = await seedQueued("sms");

    await expect(
      deliverNotification(
        store,
        { notificationId: record.id, simulateFailure: true },
        { attemptsMade: 0, maxAttempts: 3 }
      )
    ).rejects.toThrow();

    const updated = await store.get(record.id);
    expect(updated?.status).toBe("processing");
  });

  it("marks the record failed with the error once the final attempt is exhausted", async () => {
    const record = await seedQueued("push");

    await expect(
      deliverNotification(
        store,
        { notificationId: record.id, simulateFailure: true },
        { attemptsMade: 2, maxAttempts: 3 }
      )
    ).rejects.toThrow();

    const updated = await store.get(record.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.error).toBeTruthy();
  });

  it("throws for a notification id that doesn't exist in the store", async () => {
    await expect(
      deliverNotification(
        store,
        { notificationId: "does-not-exist" },
        { attemptsMade: 0, maxAttempts: 1 }
      )
    ).rejects.toThrow(/not found/);
  });
});
