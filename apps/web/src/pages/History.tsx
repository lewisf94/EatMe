import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { ActivityEntry, UsageInsights } from "@eatme/shared";
import { api } from "../api";
import { IconBack } from "../ui/icons";

const EVENT_LABELS: Record<string, string> = {
  added: "Added a pack",
  opened: "Marked opened",
  fraction_changed: "Updated amount",
  cooked: "Used in a recipe",
  finished: "Finished",
  binned: "Binned",
  archived: "Removed a pack",
  restored: "Restored a pack",
  repurchased: "Bought again",
};

const money = (value: number | null) =>
  value == null
    ? "Not enough receipt prices"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

export default function History() {
  const nav = useNavigate();
  const [days, setDays] = useState(90);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [insights, setInsights] = useState<UsageInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.activity(100), api.insights(days)]).then(
      ([events, summary]) => {
        setActivity(events);
        setInsights(summary);
        setError(null);
      },
      (reason) => setError(reason instanceof Error ? reason.message : "Couldn’t load history"),
    );
  }, [days]);
  useEffect(load, [load]);

  const restore = async (entry: ActivityEntry) => {
    setBusy(entry.lotId);
    try {
      await api.restoreLot(entry.lotId);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t restore that pack");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="appbar">
        <div className="bar-left">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <h1>History & insights</h1>
        </div>
      </header>
      <div className="screen">
        {error && <p className="alert">{error}</p>}

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Last</span>
            <select
              className="field"
              style={{ width: "auto" }}
              value={days}
              aria-label="Insight period"
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>12 months</option>
            </select>
          </div>
          {insights && (
            <div className="rgroup">
              <div className="srow">
                <span className="grow">Packs finished</span>
                <strong>{insights.finished}</strong>
              </div>
              <div className="srow">
                <span className="grow">Packs binned</span>
                <strong>{insights.binned}</strong>
              </div>
              <div className="srow">
                <span className="grow">Recipes cooked</span>
                <strong>{insights.cooked}</strong>
              </div>
              <div className="srow">
                <span className="grow">Est. value used</span>
                <strong>{money(insights.estimatedValueUsed)}</strong>
              </div>
              <div className="srow">
                <span className="grow">Est. value wasted</span>
                <strong>{money(insights.estimatedValueWasted)}</strong>
              </div>
            </div>
          )}
          <p className="note left tiny" style={{ marginTop: 8 }}>
            Value estimates use matched prices from your imported receipts. No price is invented
            when one isn’t available.
          </p>
        </section>

        {insights && insights.products.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <span className="eyebrow">Product patterns</span>
            </div>
            <div className="rgroup">
              {insights.products.map((item) => (
                <Link className="srow" key={item.productId} to={`/product/${item.productId}`}>
                  <span className="grow">{item.name}</span>
                  <span className="srow-sub">
                    {item.finished} finished · {item.binned} binned
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Recent activity</span>
          </div>
          {activity.length === 0 ? (
            <p className="empty">No activity recorded yet.</p>
          ) : (
            <div className="rgroup">
              {activity.map((entry) => (
                <div className="srow" key={entry.id}>
                  <span className="grow">
                    <Link className="mini" to={`/product/${entry.productId}`}>
                      {entry.productName}
                    </Link>
                    <span className="srow-sub">
                      {" "}
                      · {EVENT_LABELS[entry.event] ?? entry.event} ·{" "}
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </span>
                  {entry.canRestore && (
                    <button
                      className="mini"
                      disabled={busy === entry.lotId}
                      onClick={() => void restore(entry)}
                    >
                      {busy === entry.lotId ? "Restoring…" : "Undo"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
