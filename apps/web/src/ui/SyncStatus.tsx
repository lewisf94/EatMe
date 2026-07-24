import { useState } from "react";
import { usePending, replayOutbox } from "../offline";

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(ms);

/** A slim, honest status line: shown only when there's something to say —
 *  we're offline, or there are edits still waiting to reach the server. */
export function SyncStatus({ syncedAt, offline }: { syncedAt: number | null; offline: boolean }) {
  const pending = usePending();
  const [syncing, setSyncing] = useState(false);
  if (!offline && pending.length === 0) return null;

  const time = syncedAt != null ? fmtTime(syncedAt) : null;
  const main = offline
    ? time
      ? `Offline · saved ${time}`
      : "Offline · showing your saved cupboard"
    : time
      ? `Last synced ${time}`
      : "Synced";
  const waiting = pending.length > 0 ? ` · ${pending.length} waiting to sync` : "";

  const doSync = async () => {
    setSyncing(true);
    try {
      await replayOutbox();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`syncbar${offline ? " off" : ""}`} role="status">
      <span>
        {main}
        {waiting}
      </span>
      {pending.length > 0 && !offline && (
        <button className="mini" onClick={doSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      )}
    </div>
  );
}
