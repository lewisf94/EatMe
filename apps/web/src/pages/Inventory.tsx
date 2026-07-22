import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Category, Location, InventoryRow } from "@eatme/shared";
import { api, isAbort } from "../api";
import { StatusBadge, FractionBar, daysPhrase, cls } from "../ui";

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("urgency");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.locations().then(setLocs);
    void api.categories().then(setCats);
  }, []);

  const load = useCallback(
    (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (location) params.set("location", location);
      if (status) params.set("status", status);
      params.set("sort", sort);
      setLoading(true);
      api.inventory("?" + params.toString(), signal).then(
        (d) => {
          setRows(d);
          setError(null);
          setLoading(false);
        },
        (err) => {
          if (isAbort(err)) return; // superseded by a newer query; ignore
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        },
      );
    },
    [q, location, status, sort],
  );

  useEffect(() => {
    // Debounce, and abort the in-flight request when inputs change so a slow
    // early response can't overwrite a newer one (out-of-order results bug).
    const ctrl = new AbortController();
    const t = setTimeout(() => load(ctrl.signal), 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load]);

  const locName = (id: string | null) => locs.find((l) => l.id === id)?.name ?? "";

  return (
    <div className="space-y-3">
      <input
        className={cls.input}
        placeholder="Search the cupboard…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search"
      />

      <div className="flex gap-2">
        <select
          className={cls.input}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {locs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          className={cls.input}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="use_soon">Use soon</option>
          <option value="quality_declining">Quality declining</option>
          <option value="past_best">Past best-before</option>
          <option value="past_use_by">Past use-by</option>
          <option value="ok">OK</option>
        </select>
      </div>

      <div className="flex gap-2 text-sm">
        {(["urgency", "name", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`rounded-full px-3 py-1 ${
              sort === s ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {s === "urgency" ? "Most urgent" : s === "name" ? "A–Z" : "Recent"}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="py-8 text-center text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <p className="mb-2 text-4xl">🫙</p>
          <p>Nothing here yet.</p>
          <Link to="/add" className={`mt-4 ${cls.btn}`}>
            Add your first item
          </Link>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="inventory-list">
          {rows.map((it) => (
            <li key={it.productId}>
              <Link
                to={`/product/${it.productId}`}
                className={`flex items-center gap-3 ${cls.card} active:bg-slate-50`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{it.name}</span>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="mt-0.5 truncate text-sm text-slate-500">
                    {[
                      it.brand,
                      locName(it.locationId),
                      it.pressureDate ? daysPhrase(it.daysLeft) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {it.totalCount > 1 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {it.totalCount} packs
                  </span>
                ) : (
                  it.fractionLeft != null && <FractionBar value={it.fractionLeft} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
