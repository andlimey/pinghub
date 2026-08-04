import type { ChannelSender, ChannelSendResult } from "../types.js";

export const emailChannel: ChannelSender = {
  send(destination, message, opts): ChannelSendResult {
    if (opts?.simulateFailure) {
      return { success: false, error: "Simulated email bounce" };
    }
    console.log(`[mock:email] -> ${destination}: ${message}`);
    return { success: true };
  },
};
