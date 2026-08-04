import type { ChannelSender, ChannelSendResult } from "../types.js";

export const smsChannel: ChannelSender = {
  send(destination, message, opts): ChannelSendResult {
    if (opts?.simulateFailure) {
      return { success: false, error: "Simulated SMS carrier rejection" };
    }
    console.log(`[mock:sms] -> ${destination}: ${message}`);
    return { success: true };
  },
};
