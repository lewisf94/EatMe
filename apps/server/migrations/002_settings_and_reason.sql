CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('household_timezone', 'Europe/London');

-- Archive reason so waste stats aren't all "binned".
ALTER TABLE usage_log ADD COLUMN reason TEXT;
