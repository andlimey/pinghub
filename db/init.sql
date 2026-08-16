CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
