import { Router } from "express";
import { NotificationService, ValidationError } from "./notificationService.js";

export function createRouter(service: NotificationService): Router {
  const router = Router();

  router.post("/notifications", async (req, res) => {
    try {
      const record = await service.send(req.body ?? {});
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

  router.get("/notifications/:id", async (req, res) => {
    const record = await service.getById(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(record);
  });

  return router;
}
