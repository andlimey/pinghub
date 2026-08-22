import { Resend } from "resend";
import type { ChannelSender, ChannelSendResult } from "../types.js";
import { config } from "../config.js";

const resend = new Resend(config.resendApiKey);

/** Resend's shared sandbox sender — works without a verified custom domain. */
const FROM_ADDRESS = "PingHub <onboarding@resend.dev>";

export const emailChannel: ChannelSender = {
  async send(destination, message, opts): Promise<ChannelSendResult> {
    if (opts?.simulateFailure) {
      return { success: false, error: "Simulated email bounce" };
    }

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: destination,
      subject: "PingHub Notification",
      text: message,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  },
};
