import { describe, expect, it } from "vitest";
import { smsChannel } from "../src/channels/sms.js";
import { emailChannel } from "../src/channels/email.js";
import { pushChannel } from "../src/channels/push.js";

describe.each([
  ["sms", smsChannel],
  ["email", emailChannel],
  ["push", pushChannel],
] as const)("%s channel", (_name, channel) => {
  it("succeeds by default", () => {
    const result = channel.send("dest", "hello");
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails when simulateFailure is set", () => {
    const result = channel.send("dest", "hello", { simulateFailure: true });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
