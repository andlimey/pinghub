import express, { type Express } from "express";
import { createRouter } from "./routes.js";
import { NotificationService } from "./notificationService.js";
import { NotificationStore } from "./store.js";

export function createApp(): Express {
  const store = new NotificationStore();
  const service = new NotificationService(store);

  const app = express();
  app.use(express.json());
  app.use(createRouter(service));

  return app;
}
