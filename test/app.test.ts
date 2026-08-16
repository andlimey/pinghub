import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { deliveryQueue } from "../src/queue.js";
import { redisConnection } from "../src/redis.js";

describe("PingHub API", () => {
  afterAll(async () => {
    await deliveryQueue.close();
    await redisConnection.quit();
    await pool.end();
  });

  it("POST /notifications accepts a valid request and returns 202 queued", async () => {
    const app = createApp();

    const res = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "push",
      destination: "device-token-123",
      message: "Welcome!",
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: expect.any(String), status: "queued" });
  });

  it("POST /notifications rejects invalid input with 400", async () => {
    const app = createApp();

    const res = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "carrier-pigeon",
      destination: "loft-1",
      message: "hi",
    });

    expect(res.status).toBe(400);
  });

  it("GET /notifications/:id returns the notification accepted by a prior POST", async () => {
    const app = createApp();

    const sendRes = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "email",
      destination: "a@b.com",
      message: "hi",
    });

    const getRes = await request(app).get(`/notifications/${sendRes.body.id}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({
      id: sendRes.body.id,
      userId: "user-1",
      channel: "email",
    });
  });

  it("GET /notifications/:id returns 404 for an unknown id", async () => {
    const app = createApp();

    const res = await request(app).get("/notifications/does-not-exist");

    expect(res.status).toBe(404);
  });
});
