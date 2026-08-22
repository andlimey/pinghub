import { describe, expect, it } from "vitest";
import { smsChannel } from "../src/channels/sms.js";

describe.each([["sms", smsChannel]] as const)("%s channel", (_name, channel) => {
  it("succeeds by default", async () => {
    const result = await channel.send("dest", "hello");
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails when simulateFailure is set", async () => {
    const result = await channel.send("dest", "hello", { simulateFailure: true });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
