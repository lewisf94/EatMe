import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { InventoryRow, Location } from "@eatme/shared";
import { api, isAbort } from "../api";
import { loadInventory } from "../offline";
import { today } from "../ui";
import { ProductRow, FreshnessTimeline, freshOf, ClockIcon, qtyLabel } from "../ui/freshness";
import { SyncStatus } from "../ui/SyncStatus";
import { IconMenu } from "../ui/icons";

const isPast = (s: InventoryRow["status"]) =>
  s === "past_use_by" || s === "past_best" || s === "quality_declining";

export default function Today() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const td = today();

  useEffect(() => {
    void api.locations().then(setLocs);
    const ctrl = new AbortController();
    loadInventory("?sort=urgency", ctrl.signal)
      .then((d) => {
        setRows(d.rows);
        setSyncedAt(d.syncedAt);
        setOffline(d.offline);
        setError(null);
      })
      .catch((e) => !isAbort(e) && setError(e instanceof Error ? e.message : "Couldn’t load"))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const locName = (id: string | null) => locs.find((l) => l.id === id)?.name ?? "";

  const soon = rows.filter((r) => r.status === "use_soon");
  const past = rows.filter((r) => isPast(r.status));
  const hero = soon[0] ?? past[0] ?? null;
  const alsoSoon = soon.filter((r) => r.productId !== hero?.productId);
  const pastList = past.filter((r) => r.productId !== hero?.productId);
  const urgent = hero != null;
  const hf = hero ? freshOf(hero, td) : null;

  return (
    <>
      <header className="appbar">
        <span className="wm">
          Eat<span className="u">Me</span>
        </span>
        <Link className="iconbtn" to="/settings" aria-label="Settings">
          <IconMenu />
        </Link>
      </header>

      <div className="screen">
        <SyncStatus syncedAt={syncedAt} offline={offline} />
        {error && <p className="alert">{error}</p>}

        {loading && rows.length === 0 ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <p style={{ fontSize: 40, margin: "0 0 8px" }}>🫙</p>
            <p>Your cupboard is empty.</p>
            <Link to="/add" className="btn btn-line" style={{ marginTop: 16 }}>
              Add your first item
            </Link>
          </div>
        ) : (
          <>
            {hero && hf && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">Use first</span>
                </div>
                <Link className="hero" to={`/product/${hero.productId}`}>
                  <span className="tag">
                    <ClockIcon kind={hf.kind} />
                    {hf.verdict}
                  </span>
                  <h3>{hero.name}</h3>
                  <div className="meta">
                    {[
                      qtyLabel(hero.totalCount, hero.fractionLeft),
                      hero.brand,
                      locName(hero.locationId),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <FreshnessTimeline f={hf} showVerdict={false} />
                </Link>
              </section>
            )}

            {!urgent && (
              <div className="empty">
                <p>Nothing to use first — you’re on top of it.</p>
                <Link to="/food" className="btn btn-line" style={{ marginTop: 16 }}>
                  Browse all food
                </Link>
              </div>
            )}

            {alsoSoon.length > 0 && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">Also soon</span>
                </div>
                <div className="rows">
                  {alsoSoon.map((r) => (
                    <ProductRow key={r.productId} row={r} locName={locName} today={td} />
                  ))}
                </div>
              </section>
            )}

            {pastList.length > 0 && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">Past its best</span>
                  <span className="sec-count">{pastList.length}</span>
                </div>
                <div className="rows">
                  {pastList.map((r) => (
                    <ProductRow key={r.productId} row={r} locName={locName} today={td} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
