import { beforeEach, describe, expect, it } from "vitest";
import { NotificationService, ValidationError } from "../src/notificationService.js";
import { NotificationStore } from "../src/store.js";

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService(new NotificationStore());
  });

  it("sends a notification and records it as delivered", () => {
    const record = service.send({
      userId: "user-1",
      channel: "email",
      destination: "a@b.com",
      message: "hi",
    });

    expect(record.status).toBe("delivered");
    expect(record.error).toBeUndefined();
    expect(record.id).toBeTruthy();
    expect(service.getById(record.id)).toEqual(record);
  });

  it("records a failed delivery when simulateFailure is set", () => {
    const record = service.send({
      userId: "user-1",
      channel: "sms",
      destination: "+15555550100",
      message: "hi",
      simulateFailure: true,
    });

    expect(record.status).toBe("failed");
    expect(record.error).toBeTruthy();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      service.send({
        userId: "user-1",
        channel: "sms",
      } as never)
    ).toThrow(ValidationError);
  });

  it("rejects an invalid channel", () => {
    expect(() =>
      service.send({
        userId: "user-1",
        channel: "carrier-pigeon" as never,
        destination: "loft-1",
        message: "hi",
      })
    ).toThrow(ValidationError);
  });

  it("returns undefined for an unknown id", () => {
    expect(service.getById("does-not-exist")).toBeUndefined();
  });
});
