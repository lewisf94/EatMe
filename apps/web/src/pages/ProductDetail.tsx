import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  computeStatus,
  FRACTIONS,
  ARCHIVE_REASONS,
  type ArchiveReason,
  type Product,
  type StockLot,
  type Category,
  type Location,
} from "@eatme/shared";
import { api } from "../api";
import { StatusBadge, fractionLabel, daysPhrase, pressureLabel, today, cls } from "../ui";

const REASON_LABELS: Record<ArchiveReason, string> = {
  finished: "Finished it",
  binned: "Threw it away",
  duplicate: "Duplicate",
  mistake: "Added by mistake",
  other: "Other",
};

export default function ProductDetail() {
  const { id = "" } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.getProduct(id).then(
      (d) => {
        setProduct(d.product);
        setLots(d.lots);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Failed to load"),
    );
  }, [id]);

  useEffect(() => {
    reload();
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  }, [reload]);

  const guard = (p: Promise<unknown>) =>
    p.then(reload, (e) => setError(e instanceof Error ? e.message : "Update failed"));

  if (error && !product)
    return (
      <div className="py-12 text-center text-slate-600">
        <p className="mb-1 font-semibold">Couldn’t load this product.</p>
        <p className="text-sm text-slate-500">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-emerald-600">
          ← Back to cupboard
        </Link>
      </div>
    );
  if (!product) return <p className="py-8 text-center text-slate-400">Loading…</p>;

  const cat = cats.find((c) => c.id === product.categoryId);
  const addLot = () =>
    guard(
      api.createLot({
        productId: product.id,
        locationId: lots[0]?.locationId ?? product.defaultLocationId ?? locs[0]?.id ?? "",
      }),
    );

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-sm text-slate-500">
          ← Cupboard
        </Link>
        <h2 className="mt-1 text-2xl font-bold">{product.name}</h2>
        {product.brand && <p className="text-slate-500">{product.brand}</p>}
        <p className="mt-1 text-sm text-slate-500">
          {lots.length === 0
            ? "No stock left"
            : `${lots.length} ${lots.length === 1 ? "pack" : "packs"} in stock`}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {lots.map((lot) => (
        <LotCard
          key={lot.id}
          lot={lot}
          category={cat}
          locs={locs}
          onEvent={(event, fractionAfter) =>
            guard(api.postLotEvent(lot.id, { event, fractionAfter }))
          }
          onPatch={(patch) => guard(api.patchLot(lot.id, patch))}
          onArchive={(reason) => guard(api.archiveLot(lot.id, reason))}
        />
      ))}

      <button onClick={addLot} className={`w-full ${cls.btnGhost}`} data-testid="add-lot">
        + Add another pack
      </button>
    </div>
  );
}

function LotCard({
  lot,
  category,
  locs,
  onEvent,
  onPatch,
  onArchive,
}: {
  lot: StockLot;
  category: Category | undefined;
  locs: Location[];
  onEvent: (event: "fraction_changed" | "opened", fractionAfter?: number) => void;
  onPatch: (patch: Parameters<typeof api.patchLot>[1]) => void;
  onArchive: (reason: ArchiveReason) => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const st = category
    ? computeStatus(
        lot,
        { openLifeDays: category.openLifeDays, warnDays: category.warnDays },
        today(),
      )
    : null;

  return (
    <section className={`${cls.card} space-y-4`} data-testid="lot-card">
      <div className="flex items-center justify-between">
        <p className={cls.label}>How much is left? ({fractionLabel(lot.fractionLeft)})</p>
        {st && <StatusBadge status={st.status} />}
      </div>

      <div className="grid grid-cols-6 gap-1">
        {FRACTIONS.map((f) => (
          <button
            key={f}
            data-testid={`fraction-${f}`}
            onClick={() => onEvent("fraction_changed", f)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${
              lot.fractionLeft === f
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 text-slate-700 active:bg-slate-300"
            }`}
          >
            {fractionLabel(f)}
          </button>
        ))}
      </div>

      {st && (
        <p className="text-sm text-slate-500">
          {st.pressureDate
            ? `${pressureLabel(st.pressureKind)} ${st.pressureDate} (${daysPhrase(st.daysLeft)})`
            : "No date set"}
        </p>
      )}

      <div>
        <label className={cls.label}>Opened</label>
        {lot.openedAt ? (
          <p className="text-sm text-slate-600">Opened {lot.openedAt}</p>
        ) : (
          <button className={`mt-1 ${cls.btnGhost}`} onClick={() => onPatch({ openedAt: today() })}>
            Mark opened today
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="w-36">
          <label className={cls.label} htmlFor={`dt-${lot.id}`}>
            Date type
          </label>
          <select
            id={`dt-${lot.id}`}
            className={cls.input}
            value={lot.dateType ?? "best_before"}
            onChange={(e) => onPatch({ dateType: e.target.value as "use_by" | "best_before" })}
          >
            <option value="best_before">Best before</option>
            <option value="use_by">Use by</option>
          </select>
        </div>
        <div className="flex-1">
          <label className={cls.label} htmlFor={`dv-${lot.id}`}>
            Date
          </label>
          <input
            id={`dv-${lot.id}`}
            type="date"
            className={cls.input}
            value={lot.dateValue ?? ""}
            // null clears both value and type (JSON drops undefined)
            onChange={(e) => onPatch({ dateValue: e.target.value || null })}
          />
        </div>
      </div>

      <div>
        <label className={cls.label} htmlFor={`loc-${lot.id}`}>
          Location
        </label>
        <select
          id={`loc-${lot.id}`}
          className={cls.input}
          value={lot.locationId}
          onChange={(e) => onPatch({ locationId: e.target.value })}
        >
          {locs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {archiving ? (
        <div>
          <p className={cls.label}>Why are you removing this pack?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ARCHIVE_REASONS.map((r) => (
              <button
                key={r}
                data-testid={`archive-reason-${r}`}
                onClick={() => onArchive(r)}
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
        </div>
      ) : (
        <button
          onClick={() => setArchiving(true)}
          data-testid="archive-lot"
          className="text-sm font-medium text-red-600"
        >
          Remove this pack
        </button>
      )}
    </section>
  );
}
