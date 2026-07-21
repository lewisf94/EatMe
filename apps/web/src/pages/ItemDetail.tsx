import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  computeStatus,
  FRACTIONS,
  ARCHIVE_REASONS,
  type ArchiveReason,
  type Item,
  type Category,
  type Location,
} from "@eatme/shared";
import { api } from "../api";
import { StatusBadge, fractionLabel, daysPhrase, today, cls } from "../ui";

const REASON_LABELS: Record<ArchiveReason, string> = {
  finished: "Finished it",
  binned: "Threw it away",
  duplicate: "Duplicate",
  mistake: "Added by mistake",
  other: "Other",
};

export default function ItemDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    api
      .getItem(id)
      .then(setItem, (e) => setError(e instanceof Error ? e.message : "Failed to load item"));
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  }, [id]);

  if (error && !item)
    return (
      <div className="py-12 text-center text-slate-600">
        <p className="mb-1 font-semibold">Couldn’t load this item.</p>
        <p className="text-sm text-slate-500">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-emerald-600">
          ← Back to cupboard
        </Link>
      </div>
    );
  if (!item) return <p className="py-8 text-center text-slate-400">Loading…</p>;

  const cat = cats.find((c) => c.id === item.categoryId);
  const st = cat ? computeStatus(item, cat, today()) : null;

  const update = async (patch: Parameters<typeof api.patchItem>[1]) => {
    try {
      setItem(await api.patchItem(item.id, patch));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const setFraction = async (f: number) =>
    setItem(await api.postEvent(item.id, { event: "fraction_changed", fractionAfter: f }));

  const archiveWith = async (reason: ArchiveReason) => {
    try {
      await api.archiveItem(item.id, reason);
      nav("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-sm text-slate-500">
          ← Cupboard
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-bold">{item.name}</h2>
          {st && <StatusBadge status={st.status} />}
        </div>
        {item.brand && <p className="text-slate-500">{item.brand}</p>}
        {st && (
          <p className="mt-1 text-sm text-slate-500">
            {st.pressureDate
              ? `Use by ${st.pressureDate} (${daysPhrase(st.daysLeft)})`
              : "No date set"}
          </p>
        )}
      </div>

      <section>
        <p className={cls.label}>How much is left? ({fractionLabel(item.fractionLeft)})</p>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {FRACTIONS.map((f) => (
            <button
              key={f}
              data-testid={`fraction-${f}`}
              onClick={() => setFraction(f)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${
                item.fractionLeft === f
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-700 active:bg-slate-300"
              }`}
            >
              {fractionLabel(f)}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <label className={cls.label}>Opened</label>
          {item.openedAt ? (
            <p className="text-sm text-slate-600">Opened {item.openedAt}</p>
          ) : (
            <button
              className={`mt-1 ${cls.btnGhost}`}
              onClick={() => update({ openedAt: today() })}
            >
              Mark opened today
            </button>
          )}
        </div>

        <div>
          <label className={cls.label} htmlFor="loc">
            Location
          </label>
          <select
            id="loc"
            className={cls.input}
            value={item.locationId}
            onChange={(e) => update({ locationId: e.target.value })}
          >
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={cls.label} htmlFor="cat">
            Category
          </label>
          <select
            id="cat"
            className={cls.input}
            value={item.categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={cls.label} htmlFor="bb">
            Best before
          </label>
          <input
            id="bb"
            type="date"
            className={cls.input}
            value={item.bestBefore ?? ""}
            // `null` (not undefined) clears it: JSON.stringify drops undefined,
            // so clearing the field must send an explicit null to the server.
            onChange={(e) => update({ bestBefore: e.target.value || null })}
          />
        </div>

        <div>
          <label className={cls.label} htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className={cls.input}
            rows={2}
            defaultValue={item.notes ?? ""}
            onBlur={(e) => update({ notes: e.target.value.trim() || null })}
          />
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {archiving ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className={cls.label}>Why are you removing “{item.name}”?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ARCHIVE_REASONS.map((r) => (
              <button
                key={r}
                data-testid={`archive-reason-${r}`}
                onClick={() => archiveWith(r)}
                className={cls.btnGhost}
              >
                {REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setArchiving(false)}
            className="mt-3 text-sm font-medium text-slate-500"
          >
            Cancel
          </button>
        </section>
      ) : (
        <button
          onClick={() => setArchiving(true)}
          data-testid="archive-item"
          className="text-sm font-medium text-red-600"
        >
          Archive item
        </button>
      )}
    </div>
  );
}
