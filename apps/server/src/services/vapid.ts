// The VAPID keypair that identifies this server to push services.
//
// Generated once, on first boot, and then reused forever: every subscription a
// browser hands us is bound to this public key, so regenerating it would
// silently break every device that had already opted in. Kept in its own module
// (a directory in, keys out) so that promise can be unit-tested.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";

export type Vapid = { publicKey: string; privateKey: string };

/** Load the keypair from `dir`, creating it only if the file isn't there. */
export function loadOrCreateVapid(dir: string): Vapid {
  const file = join(dir, "vapid.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Vapid;

  const keys = webpush.generateVAPIDKeys();
  // Don't assume the data directory is still there: it's a mounted volume in the
  // add-on, and something may have moved it since boot.
  mkdirSync(dir, { recursive: true });
  // 0600: the private key is a credential.
  writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}
