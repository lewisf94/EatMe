import { db } from "../db.js";
import { newId } from "@eatme/shared";

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type Row = { id: string; endpoint: string; keys_json: string };

const toRecord = (r: Row): PushSubscriptionRecord => ({
  id: r.id,
  endpoint: r.endpoint,
  keys: JSON.parse(r.keys_json) as PushSubscriptionRecord["keys"],
});

export function listSubscriptions(): PushSubscriptionRecord[] {
  return (db.prepare("SELECT id, endpoint, keys_json FROM push_subscriptions").all() as Row[]).map(
    toRecord,
  );
}

/** Upsert by endpoint so tapping "turn on notifications" twice is harmless. */
export function saveSubscription(endpoint: string, keys: unknown): PushSubscriptionRecord {
  db.prepare(
    `INSERT INTO push_subscriptions (id, endpoint, keys_json, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json`,
  ).run(newId(), endpoint, JSON.stringify(keys), new Date().toISOString());
  const r = db
    .prepare("SELECT id, endpoint, keys_json FROM push_subscriptions WHERE endpoint = ?")
    .get(endpoint) as Row;
  return toRecord(r);
}

export function deleteSubscriptionByEndpoint(endpoint: string): boolean {
  return db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint).changes > 0;
}

export function countSubscriptions(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n;
}
