// Web Push delivery: VAPID keys, sending (with pruning of dead subscriptions),
// and the in-process schedule that runs the jobs. What to say and when to say it
// lives in push-rules.ts, which is pure and unit-tested.
import webpush from "web-push";
import { civilToday } from "@eatme/shared";
import { loadOrCreateVapid, type Vapid } from "./vapid.js";
import { config } from "../config.js";
import { listSubscriptions, deleteSubscriptionByEndpoint } from "../repo/push.js";
import { listInventory } from "../repo/inventory.js";
import { getSetting, setSetting, timezone } from "../repo/settings.js";
import {
  weeklyDigest,
  useByTomorrow,
  jobsDue,
  isGone,
  type JobName,
  type PushPayload,
} from "./push-rules.js";

let vapid: Vapid | null = null;

/** The keypair for this install, loaded from DATA_DIR (created on first boot). */
export function ensureVapid(): Vapid {
  if (vapid) return vapid;
  vapid = loadOrCreateVapid(config.dataDir);
  webpush.setVapidDetails(config.vapidSubject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

export const publicKey = (): string => ensureVapid().publicKey;

export type SendResult = { sent: number; pruned: number; failed: number };

/**
 * Send to every subscribed device. Subscriptions the push service says are gone
 * are deleted (iOS expires them silently); anything else — an unreachable push
 * service, a transient 5xx — is counted and stepped over, never thrown, so one
 * bad endpoint can't stop the digest reaching the other devices.
 */
export async function sendToAll(payload: PushPayload): Promise<SendResult> {
  ensureVapid();
  const result: SendResult = { sent: 0, pruned: 0, failed: 0 };
  for (const sub of listSubscriptions()) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
      );
      result.sent++;
    } catch (err) {
      if (isGone(err)) {
        deleteSubscriptionByEndpoint(sub.endpoint);
        result.pruned++;
      } else {
        // Keep the reason visible: a push service that starts refusing us is
        // otherwise invisible, since we deliberately don't throw.
        console.warn("push delivery failed:", (err as Error)?.message ?? err);
        result.failed++;
      }
    }
  }
  return result;
}

function localClock(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: civilToday(tz, now),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    hour: Number(get("hour")),
  };
}

const lastKey = (job: JobName) => `push_last_${job}`;

/** Run whatever is due now. Safe to call often — a no-op the rest of the day. */
export async function runDueJobs(now = new Date()): Promise<JobName[]> {
  const tz = timezone();
  const local = localClock(tz, now);
  const due = jobsDue(local, {
    digest: getSetting(lastKey("digest")),
    expiry: getSetting(lastKey("expiry")),
  });
  if (due.length === 0) return [];

  const rows = listInventory({}, civilToday(tz, now));
  for (const job of due) {
    const payload = job === "digest" ? weeklyDigest(rows) : useByTomorrow(rows);
    // Mark it done either way — "nothing to say today" still counts as handled.
    setSetting(lastKey(job), local.date);
    if (payload) await sendToAll(payload);
  }
  return due;
}

/** Check in every quarter of an hour. No cron dependency, and unref'd so it
 *  never holds the process open. */
export function startPushSchedule(): NodeJS.Timeout {
  const timer = setInterval(
    () => {
      void runDueJobs().catch(() => {
        /* a push failure must never take the server down */
      });
    },
    15 * 60 * 1000,
  );
  timer.unref();
  return timer;
}
