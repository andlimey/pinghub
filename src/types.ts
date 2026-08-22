export type Channel = "sms" | "email" | "push";

export type NotificationStatus = "queued" | "processing" | "delivered" | "failed";

export interface SendNotificationRequest {
  userId: string;
  channel: Channel;
  destination: string;
  message: string;
  /** Testing hook: forces the mock channel to report a failed delivery. */
  simulateFailure?: boolean;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  channel: Channel;
  destination: string;
  message: string;
  status: NotificationStatus;
  error?: string;
  createdAt: string;
}

export interface ChannelSendResult {
  success: boolean;
  error?: string;
}

export interface ChannelSender {
  send(
    destination: string,
    message: string,
    opts?: { simulateFailure?: boolean }
  ): ChannelSendResult | Promise<ChannelSendResult>;
}
