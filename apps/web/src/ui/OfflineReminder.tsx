import { useState } from "react";
import { checkServer, useReachable } from "../connection";

/** A clear reminder at the top of every screen while the phone cannot reach
 *  the EatMe server. Remote access uses Tailscale, and the usual cause is that
 *  Tailscale is off, so the reminder says that first. It goes away by itself
 *  when the server answers again (the app checks every 20 s and on return). */
export default function OfflineReminder() {
  const reachable = useReachable();
  const [checking, setChecking] = useState(false);
  if (reachable !== false) return null;

  const retry = async () => {
    setChecking(true);
    try {
      await checkServer();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="offline-reminder" role="alert">
      <div className="offline-reminder__text">
        <strong>Can’t reach EatMe</strong>
        <span>Is Tailscale on? Turn it on, then come back here.</span>
      </div>
      <button className="offline-reminder__btn" onClick={retry} disabled={checking}>
        {checking ? "Checking…" : "Try again"}
      </button>
    </div>
  );
}
