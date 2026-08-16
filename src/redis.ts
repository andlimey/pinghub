import { Redis } from "ioredis";
import { config } from "./config.js";

/** Shared BullMQ connection. `maxRetriesPerRequest: null` is required by BullMQ's blocking commands. */
export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});
