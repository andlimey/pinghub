import type { ChannelSender, ChannelSendResult } from "../types.js";

export const pushChannel: ChannelSender = {
  send(destination, message, opts): ChannelSendResult {
    if (opts?.simulateFailure) {
      return { success: false, error: "Simulated push token invalid" };
    }
    console.log(`[mock:push] -> ${destination}: ${message}`);
    return { success: true };
  },
};
