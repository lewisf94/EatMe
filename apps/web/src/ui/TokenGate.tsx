import { useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { TOKEN_KEY, UNAUTHORIZED_EVENT } from "../api";
import { IconCheck } from "./icons";
import "./TokenGate.css";

/* The card stack is adapted from the React Bits Clerk verification flow:
 * submitting the token "stacks" a second card over the first. The lower card
 * dims and recedes while the check card springs in from below. */
const ENTRY_VARIANTS = {
  idle: { opacity: 1, scale: 1, y: 0 },
  checking: { opacity: 0.6, scale: 0.95, y: -10 },
};
const CHECK_VARIANTS = {
  idle: { opacity: 0, y: 100 },
  checking: { opacity: 1, y: 0 },
};

type Phase = "idle" | "checking" | "ok";

/** Asks the server with the candidate token, before anything is saved. */
async function tokenWorks(token: string): Promise<"ok" | "rejected" | "offline"> {
  try {
    const res = await fetch("/api/settings", { headers: { authorization: `Bearer ${token}` } });
    if (res.ok) return "ok";
    return res.status === 401 ? "rejected" : "offline";
  } catch {
    return "offline";
  }
}

/** Shown over the app when the server answers 401: the add-on generates an
 *  access token on first start, so a new device must be given it once. */
export default function TokenGate() {
  const [locked, setLocked] = useState(false);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    const lock = () => setLocked(true);
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, []);
  if (!locked) return null;

  const check = async () => {
    const value = token.trim();
    if (!value || phase !== "idle") return;
    setError("");
    setPhase("checking");
    const result = await tokenWorks(value);
    if (result !== "ok") {
      setPhase("idle");
      setError(
        result === "rejected"
          ? "EatMe did not accept that token. Check it and try again."
          : "Couldn’t reach EatMe. Check the connection and try again.",
      );
      return;
    }
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      // Private mode can refuse storage; the reload then asks again.
    }
    setPhase("ok");
    setTimeout(() => window.location.reload(), 900);
  };

  const stacked = phase !== "idle";

  return (
    <div className="screen token-gate" role="dialog" aria-labelledby="token-gate-title">
      <MotionConfig
        reducedMotion="user"
        transition={{ type: "spring", bounce: 0.3, visualDuration: 0.4 }}
      >
        <motion.div className="tg-stack" animate={stacked ? "checking" : "idle"} initial={false}>
          <motion.div className="tg-card" variants={ENTRY_VARIANTS} inert={stacked || undefined}>
            <h1 id="token-gate-title">Enter your access token</h1>
            <p className="note left" style={{ marginBottom: 10 }}>
              EatMe needs its access token on each new device. Find it in the EatMe app log in Home
              Assistant (the line that starts &ldquo;generated auth_token&rdquo;), or in the{" "}
              <code>auth_token</code> option if you set one.
            </p>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                void check();
              }}
            >
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                aria-label="Access token"
                aria-invalid={error ? true : undefined}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button className="btn btn-primary" style={{ flex: "none" }} type="submit">
                Save
              </button>
            </form>
            {error && (
              <p className="alert" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>
                {error}
              </p>
            )}
          </motion.div>

          <AnimatePresence mode="popLayout">
            {stacked && (
              <motion.div
                className="tg-card tg-card--over"
                variants={CHECK_VARIANTS}
                initial="idle"
                animate="checking"
                exit="idle"
                role="status"
                aria-live="polite"
              >
                <span
                  className="tg-mark"
                  data-ok={phase === "ok" ? "" : undefined}
                  aria-hidden="true"
                >
                  {phase === "ok" ? <IconCheck /> : <span className="tg-spin" />}
                </span>
                <h2>{phase === "ok" ? "Connected" : "Checking the token…"}</h2>
                <p className="note">
                  {phase === "ok"
                    ? "This device can now use EatMe. Opening the app."
                    : "Asking the EatMe server."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </MotionConfig>
    </div>
  );
}
