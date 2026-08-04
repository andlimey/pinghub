import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("PingHub API", () => {
  it("POST /notifications sends and returns a delivered notification", async () => {
    const app = createApp();

    const res = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "push",
      destination: "device-token-123",
      message: "Welcome!",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: "user-1",
      channel: "push",
      status: "delivered",
    });
  });

  it("POST /notifications with simulateFailure returns a failed notification", async () => {
    const app = createApp();

    const res = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "sms",
      destination: "+15555550100",
      message: "Welcome!",
      simulateFailure: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("failed");
    expect(res.body.error).toBeTruthy();
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

  it("GET /notifications/:id returns a previously sent notification", async () => {
    const app = createApp();

    const sendRes = await request(app).post("/notifications").send({
      userId: "user-1",
      channel: "email",
      destination: "a@b.com",
      message: "hi",
    });

    const getRes = await request(app).get(`/notifications/${sendRes.body.id}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(sendRes.body);
  });

  it("GET /notifications/:id returns 404 for an unknown id", async () => {
    const app = createApp();

    const res = await request(app).get("/notifications/does-not-exist");

    expect(res.status).toBe(404);
  });
});
