import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotificationService, ValidationError } from "../src/notificationService.js";
import { NotificationStore } from "../src/store.js";
import { pool } from "../src/db.js";

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService(new NotificationStore());
  });

  afterAll(async () => {
    await pool.end();
  });

  it("sends a notification and records it as delivered", async () => {
    const record = await service.send({
      userId: "user-1",
      channel: "email",
      destination: "a@b.com",
      message: "hi",
    });

    expect(record.status).toBe("delivered");
    expect(record.error).toBeUndefined();
    expect(record.id).toBeTruthy();
    expect(await service.getById(record.id)).toEqual(record);
  });

  it("records a failed delivery when simulateFailure is set", async () => {
    const record = await service.send({
      userId: "user-1",
      channel: "sms",
      destination: "+15555550100",
      message: "hi",
      simulateFailure: true,
    });

    expect(record.status).toBe("failed");
    expect(record.error).toBeTruthy();
  });

  it("rejects missing required fields", async () => {
    await expect(
      service.send({
        userId: "user-1",
        channel: "sms",
      } as never)
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an invalid channel", async () => {
    await expect(
      service.send({
        userId: "user-1",
        channel: "carrier-pigeon" as never,
        destination: "loft-1",
        message: "hi",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("returns undefined for an unknown id", async () => {
    expect(await service.getById("does-not-exist")).toBeUndefined();
  });
});
