import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  computeStatus,
  FRACTIONS,
  type Item,
  type Category,
  type Location,
} from "@whattoeat/shared";
import { api } from "../api";
import { StatusBadge, fractionLabel, daysPhrase, today, cls } from "../ui";

export default function ItemDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);

  useEffect(() => {
    void api.getItem(id).then(setItem);
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  }, [id]);

  if (!item) return <p className="py-8 text-center text-slate-400">Loading…</p>;

  const cat = cats.find((c) => c.id === item.categoryId);
  const st = cat ? computeStatus(item, cat, new Date()) : null;

  const update = async (patch: Parameters<typeof api.patchItem>[1]) =>
    setItem(await api.patchItem(item.id, patch));

  const setFraction = async (f: number) =>
    setItem(await api.postEvent(item.id, { event: "fraction_changed", fractionAfter: f }));

  const archive = async () => {
    if (confirm(`Archive "${item.name}"?`)) {
      await api.archiveItem(item.id);
      nav("/");
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
            onChange={(e) => update({ bestBefore: e.target.value || undefined })}
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
            onBlur={(e) => update({ notes: e.target.value || undefined })}
          />
        </div>
      </section>

      <button onClick={archive} className="text-sm font-medium text-red-600">
        Archive item
      </button>
    </div>
  );
}
