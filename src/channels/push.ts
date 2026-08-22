import { existsSync, readFileSync } from "node:fs";
import { cert, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { ChannelSender, ChannelSendResult } from "../types.js";
import { config } from "../config.js";

/** `FIREBASE_SERVICE_ACCOUNT` is either a file path or the raw JSON contents — see .env.example. */
function loadServiceAccount(): ServiceAccount {
  const raw = config.firebaseServiceAccount;
  const json = existsSync(raw) ? readFileSync(raw, "utf-8") : raw;
  return JSON.parse(json) as ServiceAccount;
}

const app = initializeApp({ credential: cert(loadServiceAccount()) });
const messaging = getMessaging(app);

export const pushChannel: ChannelSender = {
  async send(destination, message, opts): Promise<ChannelSendResult> {
    if (opts?.simulateFailure) {
      return { success: false, error: "Simulated push token invalid" };
    }

    try {
      await messaging.send({
        token: destination,
        notification: { body: message },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
