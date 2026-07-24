// Turning on notifications from the browser side.
//
// iOS only delivers Web Push to a PWA that has been added to the Home Screen,
// and the permission prompt must come from a real tap — never on load.
import { api } from "./api";

export type PushState = "unsupported" | "denied" | "on" | "off";

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function applicationServerKey(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buf;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** Must be called from a user gesture. Idempotent: re-running just re-registers
 *  the same endpoint, which the server upserts. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted")
    return Notification.permission === "denied" ? "denied" : "off";

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.pushPublicKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  await api.pushSubscribe(sub.toJSON() as { endpoint: string; keys: Record<string, string> });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {
      /* the server may already have pruned it */
    });
    await sub.unsubscribe();
  }
  return "off";
}
