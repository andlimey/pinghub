import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export const DELIVERY_QUEUE_NAME = "notification-delivery";
export const DELIVERY_JOB_NAME = "deliver-notification";

export interface DeliveryJobData {
  notificationId: string;
  /** Testing hook, forwarded from the original request to the mock channel. */
  simulateFailure?: boolean;
}

export const deliveryQueue = new Queue<DeliveryJobData>(DELIVERY_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 500 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
