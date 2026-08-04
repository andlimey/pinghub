import { Router } from "express";
import { NotificationService, ValidationError } from "./notificationService.js";

export function createRouter(service: NotificationService): Router {
  const router = Router();

  router.post("/notifications", (req, res) => {
    try {
      const record = service.send(req.body ?? {});
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/notifications/:id", (req, res) => {
    const record = service.getById(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(record);
  });

  return router;
}
