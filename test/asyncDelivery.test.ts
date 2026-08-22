import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { NotificationStore } from "../src/store.js";
import { deliveryQueue, DELIVERY_JOB_NAME } from "../src/queue.js";
import { redisConnection } from "../src/redis.js";
import { startWorker } from "../src/worker.js";
import { pool } from "../src/db.js";
import type { Channel, NotificationRecord, NotificationStatus } from "../src/types.js";

describe("async delivery pipeline (real queue + worker)", () => {
  const store = new NotificationStore();
  const worker = startWorker(store);

  afterAll(async () => {
    await worker.close();
    await deliveryQueue.close();
    await redisConnection.quit();
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

  async function waitForStatus(
    id: string,
    targets: NotificationStatus[],
    timeoutMs: number
  ): Promise<NotificationRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const record = await store.get(id);
      if (record && targets.includes(record.status)) {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for notification ${id} to reach ${targets.join("/")}`);
  }

  it("moves a queued job through processing to delivered", async () => {
    // "push" stays a pure mock; "email" now makes a real Resend call
    // (covered separately in emailChannel.test.ts) so it's excluded here.
    const record = await seedQueued("push");

    await deliveryQueue.add(DELIVERY_JOB_NAME, { notificationId: record.id });

    const delivered = await waitForStatus(record.id, ["delivered", "failed"], 5000);
    expect(delivered.status).toBe("delivered");
  }, 10000);

  it("retries a failing send and eventually marks the notification failed", async () => {
    const record = await seedQueued("sms");

    await deliveryQueue.add(DELIVERY_JOB_NAME, {
      notificationId: record.id,
      simulateFailure: true,
    });

    const failed = await waitForStatus(record.id, ["failed"], 10000);
    expect(failed.status).toBe("failed");
    expect(failed.error).toBeTruthy();
  }, 15000);
});
