import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { InventoryRow, Location } from "@eatme/shared";
import { api, isAbort } from "../api";
import { loadInventory } from "../offline";
import { today } from "../ui";
import { FreshnessTimeline, freshOf, ClockIcon, qtyLabel } from "../ui/freshness";
import { SyncStatus } from "../ui/SyncStatus";
import { SwipeProductRow, UndoBar, useSwipeArchive } from "../ui/swipeArchive";
import { IconMenu } from "../ui/icons";
import WarmTooltip from "../ui/WarmTooltip";

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
  const swipe = useSwipeArchive();

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

  // Among items due equally soon, safety outranks quality: eating past a use-by
  // is a health risk, past a best-before is only a question of how good it is.
  const soon = rows
    .filter((r) => r.status === "use_soon")
    .sort(
      (a, b) =>
        (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) ||
        Number(b.pressureKind === "use_by") - Number(a.pressureKind === "use_by"),
    );
  const past = rows.filter((r) => isPast(r.status));
  const hero = soon[0] ?? past[0] ?? null;
  const keep = (r: InventoryRow) =>
    r.productId !== hero?.productId && !swipe.hidden.has(r.productId);
  const alsoSoon = soon.filter(keep);
  const pastList = past.filter(keep);
  const urgent = hero != null;
  const hf = hero ? freshOf(hero, td) : null;

  return (
    <>
      <header className="appbar">
        {/* On a desktop the side navigation carries the wordmark and Settings. */}
        <span className="wm phone-only">
          Eat<span className="u">Me</span>
        </span>
        <h1 className="desk-only">Today</h1>
        <WarmTooltip content="Settings">
          <Link className="iconbtn phone-only" to="/settings" aria-label="Settings">
            <IconMenu />
          </Link>
        </WarmTooltip>
      </header>

      <div className="screen">
        <SyncStatus syncedAt={syncedAt} offline={offline} />
        {error && <p className="alert">{error}</p>}
        {swipe.error && <p className="alert">{swipe.error}</p>}

        {loading && rows.length === 0 ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <p>Your food inventory is empty.</p>
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
                    <SwipeProductRow
                      key={r.productId}
                      row={r}
                      locName={locName}
                      today={td}
                      onArchive={swipe.archive}
                    />
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
                    <SwipeProductRow
                      key={r.productId}
                      row={r}
                      locName={locName}
                      today={td}
                      onArchive={swipe.archive}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <UndoBar swipe={swipe} />
    </>
  );
}
