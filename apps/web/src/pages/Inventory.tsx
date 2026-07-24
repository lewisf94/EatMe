import { useCallback, useEffect, useState } from "react";
import type { InventoryRow, Location } from "@eatme/shared";
import { api, isAbort } from "../api";
import { loadInventory } from "../offline";
import { today } from "../ui";
import { ProductRow } from "../ui/freshness";
import { SyncStatus } from "../ui/SyncStatus";
import { IconSearch } from "../ui/icons";

const NO_DATE = "__nodate__";

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState(""); // "" = all · a locationId · NO_DATE
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const td = today();

  useEffect(() => {
    void api.locations().then(setLocs);
  }, []);

  const load = useCallback(
    (signal: AbortSignal) => {
      // Only search + sort go to the server; location is filtered client-side so
      // the same cached snapshot answers every chip when offline.
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      p.set("sort", "urgency");
      setLoading(true);
      loadInventory("?" + p.toString(), signal).then(
        (d) => {
          setRows(
            d.rows.filter((r) =>
              chip === NO_DATE ? r.pressureKind == null : chip ? r.locationId === chip : true,
            ),
          );
          setSyncedAt(d.syncedAt);
          setOffline(d.offline);
          setError(null);
          setLoading(false);
        },
        (err) => {
          if (isAbort(err)) return;
          setError(err instanceof Error ? err.message : "Couldn’t load");
          setLoading(false);
        },
      );
    },
    [q, chip],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => load(ctrl.signal), 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load]);

  const locName = (id: string | null) => locs.find((l) => l.id === id)?.name ?? "";
  const useFirst = rows.filter((r) => r.status !== "ok");
  const plenty = rows.filter((r) => r.status === "ok");

  const chips = [
    { key: "", label: "All" },
    ...locs.map((l) => ({ key: l.id, label: l.name })),
    { key: NO_DATE, label: "No date" },
  ];

  const section = (label: string, list: InventoryRow[]) =>
    list.length > 0 && (
      <section className="sec">
        <div className="sec-head">
          <span className="eyebrow">{label}</span>
        </div>
        <div className="rows">
          {list.map((r) => (
            <ProductRow key={r.productId} row={r} locName={locName} today={td} />
          ))}
        </div>
      </section>
    );

  return (
    <>
      <header className="appbar">
        <h1>All food</h1>
      </header>
      <div className="screen">
        <div className="search">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the cupboard…"
            aria-label="Search"
          />
        </div>

        <div className="chips">
          {chips.map((c) => (
            <button
              key={c.key || "all"}
              className="chip"
              aria-pressed={chip === c.key}
              onClick={() => setChip(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <SyncStatus syncedAt={syncedAt} offline={offline} />
        {error && <p className="alert">{error}</p>}

        {loading && rows.length === 0 ? (
          <p className="empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="empty">Nothing here{q || chip ? " matches" : " yet"}.</p>
        ) : (
          <>
            {section("Use first", useFirst)}
            {section("Still plenty of time", plenty)}
          </>
        )}
      </div>
    </>
  );
}
