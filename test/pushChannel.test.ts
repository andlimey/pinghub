import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn().mockReturnValue({}),
  cert: vi.fn(),
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn().mockReturnValue({ send: sendMock }),
}));

const { pushChannel } = await import("../src/channels/push.js");

describe("push channel (Firebase Cloud Messaging)", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("does not call FCM and reports failure when simulateFailure is set", async () => {
    const result = await pushChannel.send("token-abc", "hi", { simulateFailure: true });

    expect(result).toEqual({ success: false, error: "Simulated push token invalid" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports success when FCM accepts the send", async () => {
    sendMock.mockResolvedValue("projects/pinghub/messages/0:123456");

    const result = await pushChannel.send("token-abc", "hello there");

    expect(result).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-abc", notification: { body: "hello there" } })
    );
  });

  it("reports failure with FCM's error message when the send fails", async () => {
    sendMock.mockRejectedValue(new Error("Requested entity was not found."));

    const result = await pushChannel.send("stale-token", "hi");

    expect(result).toEqual({ success: false, error: "Requested entity was not found." });
  });
});
