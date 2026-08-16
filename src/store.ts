import type { NotificationRecord } from "./types.js";
import { pool, migrate } from "./db.js";

/** Postgres-backed notification history, shared across the API and worker processes. */
export class NotificationStore {
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = migrate();
  }

  async save(record: NotificationRecord): Promise<void> {
    await this.ready;
    await pool.query(
      `INSERT INTO notifications (id, user_id, channel, destination, message, status, error, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, error = EXCLUDED.error`,
      [
        record.id,
        record.userId,
        record.channel,
        record.destination,
        record.message,
        record.status,
        record.error ?? null,
        record.createdAt,
      ]
    );
  }

  async get(id: string): Promise<NotificationRecord | undefined> {
    await this.ready;
    const result = await pool.query(
      `SELECT id, user_id, channel, destination, message, status, error, created_at
       FROM notifications WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      destination: row.destination,
      message: row.message,
      status: row.status,
      error: row.error ?? undefined,
      createdAt: row.created_at.toISOString(),
    };
  }
}
