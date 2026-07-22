import { useCallback, useEffect, useState } from "react";
import type { InventoryRow, Location } from "@eatme/shared";
import { api, isAbort } from "../api";
import { today } from "../ui";
import { ProductRow } from "../ui/freshness";
import { IconSearch } from "../ui/icons";

const NO_DATE = "__nodate__";

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState(""); // "" = all · a locationId · NO_DATE
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const td = today();

  useEffect(() => {
    void api.locations().then(setLocs);
  }, []);

  const load = useCallback(
    (signal: AbortSignal) => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (chip && chip !== NO_DATE) p.set("location", chip);
      p.set("sort", "urgency");
      setLoading(true);
      api.inventory("?" + p.toString(), signal).then(
        (d) => {
          setRows(chip === NO_DATE ? d.filter((r) => r.pressureKind == null) : d);
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
