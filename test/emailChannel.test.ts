import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

const { emailChannel } = await import("../src/channels/email.js");

describe("email channel (Resend)", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("does not call Resend and reports failure when simulateFailure is set", async () => {
    const result = await emailChannel.send("a@b.com", "hi", { simulateFailure: true });

    expect(result).toEqual({ success: false, error: "Simulated email bounce" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports success when Resend accepts the send", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });

    const result = await emailChannel.send("a@b.com", "hello there");

    expect(result).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", text: "hello there" })
    );
  });

  it("reports failure with Resend's error message when the send fails", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid `to` field", statusCode: 422, name: "validation_error" },
    });

    const result = await emailChannel.send("not-an-email", "hi");

    expect(result).toEqual({ success: false, error: "Invalid `to` field" });
  });
});
