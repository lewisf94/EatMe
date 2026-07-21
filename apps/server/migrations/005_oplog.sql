-- Idempotency for offline write replay: each mutation may carry a client op-id;
-- we remember the result so a replayed op is a no-op returning the same result.
CREATE TABLE op_log (
  op_id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  at TEXT NOT NULL
);
