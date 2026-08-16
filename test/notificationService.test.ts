import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationService, ValidationError, type DeliveryQueue } from "../src/notificationService.js";
import { NotificationStore } from "../src/store.js";
import { DELIVERY_JOB_NAME } from "../src/queue.js";
import { pool } from "../src/db.js";

describe("NotificationService", () => {
  let service: NotificationService;
  let queue: DeliveryQueue & { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    service = new NotificationService(new NotificationStore(), queue);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("saves a valid request as queued and enqueues a delivery job", async () => {
    const record = await service.send({
      userId: "user-1",
      channel: "email",
      destination: "a@b.com",
      message: "hi",
    });

    expect(record.status).toBe("queued");
    expect(record.id).toBeTruthy();
    expect(await service.getById(record.id)).toEqual(record);
    expect(queue.add).toHaveBeenCalledWith(DELIVERY_JOB_NAME, {
      notificationId: record.id,
      simulateFailure: undefined,
    });
  });

  it("forwards simulateFailure to the job payload without resolving it synchronously", async () => {
    const record = await service.send({
      userId: "user-1",
      channel: "sms",
      destination: "+15555550100",
      message: "hi",
      simulateFailure: true,
    });

    expect(record.status).toBe("queued");
    expect(queue.add).toHaveBeenCalledWith(DELIVERY_JOB_NAME, {
      notificationId: record.id,
      simulateFailure: true,
    });
  });

  it("rejects missing required fields without touching the store or queue", async () => {
    await expect(
      service.send({
        userId: "user-1",
        channel: "sms",
      } as never)
    ).rejects.toThrow(ValidationError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("rejects an invalid channel without touching the store or queue", async () => {
    await expect(
      service.send({
        userId: "user-1",
        channel: "carrier-pigeon" as never,
        destination: "loft-1",
        message: "hi",
      })
    ).rejects.toThrow(ValidationError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("returns undefined for an unknown id", async () => {
    expect(await service.getById("does-not-exist")).toBeUndefined();
  });
});
