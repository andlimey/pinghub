import type { Channel, ChannelSender } from "../types.js";
import { smsChannel } from "./sms.js";
import { emailChannel } from "./email.js";
import { pushChannel } from "./push.js";

export const channels: Record<Channel, ChannelSender> = {
  sms: smsChannel,
  email: emailChannel,
  push: pushChannel,
};
