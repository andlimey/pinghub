import { Worker } from "bullmq";
import { redisConnection } from "./redis.js";
import { DELIVERY_QUEUE_NAME, type DeliveryJobData } from "./queue.js";
import { NotificationStore } from "./store.js";
import { channels } from "./channels/index.js";

/**
 * Delivers one queued notification: marks it `processing`, calls the channel sender, then
 * marks it `delivered`/`failed`. On a transient send failure that isn't the job's final
 * attempt, it rethrows so BullMQ retries the job — the record is only marked `failed` once
 * retries are exhausted, per the retry policy.
 */
export async function deliverNotification(
  store: NotificationStore,
  data: DeliveryJobData,
  attempt: { attemptsMade: number; maxAttempts: number }
): Promise<void> {
  const record = await store.get(data.notificationId);
  if (!record) {
    throw new Error(`Notification ${data.notificationId} not found`);
  }

  await store.save({ ...record, status: "processing" });

  const sender = channels[record.channel];
  const result = sender.send(record.destination, record.message, {
    simulateFailure: data.simulateFailure,
  });

  if (result.success) {
    await store.save({ ...record, status: "delivered", error: undefined });
    return;
  }

  const isFinalAttempt = attempt.attemptsMade + 1 >= attempt.maxAttempts;
  if (isFinalAttempt) {
    await store.save({ ...record, status: "failed", error: result.error });
  }
  throw new Error(result.error ?? "Delivery failed");
}

export function startWorker(store: NotificationStore): Worker<DeliveryJobData> {
  return new Worker<DeliveryJobData>(
    DELIVERY_QUEUE_NAME,
    (job) =>
      deliverNotification(store, job.data, {
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
      }),
    { connection: redisConnection }
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = new NotificationStore();
  const worker = startWorker(store);

  worker.on("ready", () => {
    console.log("PingHub worker ready, waiting for delivery jobs...");
  });

  worker.on("failed", (job, err) => {
    console.error(`Delivery job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });
}
