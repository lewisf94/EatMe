// Server reachability: one shared answer to "can this phone reach EatMe now?"
//
// Remote access goes through Tailscale, and the usual reason for "offline" is
// that Tailscale is off on the phone. The app checks /api/health (open, no
// token) when it starts, when it comes back to the screen, when the phone
// reports a network change, and every 20 s while unreachable. Any HTTP answer
// means the server is reachable; only a network failure or a timeout does not.
import { useSyncExternalStore } from "react";

const RETRY_MS = 20_000;
const TIMEOUT_MS = 6_000;

/** null = not checked yet, so nothing shows until the first answer. */
let reachable: boolean | null = null;
let reconnects = 0; // counts unreachable -> reachable changes
let inflight: Promise<boolean> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Record a result, from a health check or from any page load. */
export function noteReachable(ok: boolean) {
  if (ok === reachable) return;
  if (ok && reachable === false) reconnects++;
  reachable = ok;
  emit();
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (reachable === false && document.visibilityState === "visible")
    timer = setTimeout(() => void checkServer(), RETRY_MS);
}

/** Ask the server now. Calls made while a check runs share that check. */
export function checkServer(): Promise<boolean> {
  if (inflight) return inflight;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  inflight = fetch("/api/health", { cache: "no-store", signal: ctrl.signal })
    .then(
      () => true,
      () => false,
    )
    .then((ok) => {
      clearTimeout(t);
      inflight = null;
      noteReachable(ok);
      // A check with no change still needs the next retry.
      schedule();
      return ok;
    });
  return inflight;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook: true, false, or null (not checked yet). */
export function useReachable(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => reachable,
    () => reachable,
  );
}

/** Subscribe to the moment the server becomes reachable again. */
export function onReconnect(cb: () => void): () => void {
  let seen = reconnects;
  return subscribe(() => {
    if (reconnects !== seen) {
      seen = reconnects;
      cb();
    }
  });
}

/** React hook: a number that goes up each time the server comes back. Put it
 *  in a load effect's dependencies to reload fresh data after reconnecting. */
export function useReconnectCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => reconnects,
    () => reconnects,
  );
}

if (typeof window !== "undefined") {
  void checkServer();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkServer();
    else schedule(); // stop retrying while the app is in the background
  });
  window.addEventListener("online", () => void checkServer());
  window.addEventListener("offline", () => noteReachable(false));
}
