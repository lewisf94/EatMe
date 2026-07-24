-- Web Push subscriptions. One row per browser/device that opted in; the endpoint
-- is the push service's URL for that device and is unique, so re-subscribing the
-- same device updates it rather than piling up duplicates.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
