import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FRACTIONS,
  ARCHIVE_REASONS,
  type ArchiveReason,
  type Product,
  type StockLot,
  type StockLotPatch,
  type Category,
  type Location,
} from "@eatme/shared";
import { api } from "../api";
import { today, fractionLabel } from "../ui";
import { FreshnessTimeline, freshOf, lotFreshInput, clockLabel, ClockIcon } from "../ui/freshness";
import { IconBack, IconLock } from "../ui/icons";

const REASON_LABELS: Record<ArchiveReason, string> = {
  finished: "Finished it",
  binned: "Threw it away",
  duplicate: "Duplicate",
  mistake: "Added by mistake",
  other: "Other",
};

function bigPhrase(daysLeft: number | null): string {
  if (daysLeft == null) return "Not set";
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  if (daysLeft === -1) return "Yesterday";
  const n = Math.abs(daysLeft);
  const unit =
    n < 60
      ? `${n} days`
      : n < 730
        ? `${Math.round(n / 30)} months`
        : `${Math.round(n / 365)} years`;
  return daysLeft > 0 ? `In ${unit}` : `${unit} ago`;
}

export default function ProductDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const td = today();

  const reload = useCallback(() => {
    api.getProduct(id).then(
      (d) => {
        setProduct(d.product);
        setLots(d.lots);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn’t load"),
    );
  }, [id]);
  useEffect(() => {
    reload();
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  }, [reload]);

  const guard = (p: Promise<unknown>) =>
    p.then(reload, (e) => setError(e instanceof Error ? e.message : "Update failed"));

  const back = (
    <header className="appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
        <IconBack />
      </button>
    </header>
  );

  if (!product)
    return (
      <>
        {back}
        <p className="empty">{error ?? "Loading…"}</p>
      </>
    );

  const cat = cats.find((c) => c.id === product.categoryId);
  const category = { openLifeDays: cat?.openLifeDays ?? null, warnDays: cat?.warnDays ?? 14 };
  const addLot = () =>
    guard(
      api.createLot({
        productId: product.id,
        locationId: lots[0]?.locationId ?? product.defaultLocationId ?? locs[0]?.id ?? "",
      }),
    );

  return (
    <>
      {back}
      <div className="screen">
        <h1 className="title-line">{product.name}</h1>
        {product.brand && <p className="stock-line">{product.brand}</p>}
        <p className="stock-line">
          {lots.length === 0
            ? "No stock left"
            : `${lots.length} ${lots.length === 1 ? "pack" : "packs"} in stock`}
        </p>
        {error && <p className="alert">{error}</p>}

        {lots.map((lot) => (
          <LotCard
            key={lot.id}
            lot={lot}
            category={category}
            locs={locs}
            td={td}
            onEvent={(event, fractionAfter) =>
              guard(api.postLotEvent(lot.id, { event, fractionAfter }))
            }
            onPatch={(patch) => guard(api.patchLot(lot.id, patch))}
            onArchive={(reason) => guard(api.archiveLot(lot.id, reason))}
          />
        ))}

        <button className="btn btn-line" style={{ marginTop: 18, width: "100%" }} onClick={addLot}>
          + Add another pack
        </button>
      </div>
    </>
  );
}

function LotCard({
  lot,
  category,
  locs,
  td,
  onEvent,
  onPatch,
  onArchive,
}: {
  lot: StockLot;
  category: { openLifeDays: number | null; warnDays: number };
  locs: Location[];
  td: string;
  onEvent: (event: "fraction_changed" | "opened", fractionAfter?: number) => void;
  onPatch: (patch: StockLotPatch) => void;
  onArchive: (reason: ArchiveReason) => void;
}) {
  const [editAmt, setEditAmt] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const fi = lotFreshInput(lot, category, td);
  const f = freshOf(fi, td);

  return (
    <section className="lotcard" data-testid="lot-card">
      <div className={`verdict ${f.cls}`}>
        <div className="kick">
          <ClockIcon kind={fi.pressureKind} />
          {clockLabel(fi.pressureKind)}
        </div>
        <h2>{bigPhrase(fi.daysLeft)}</h2>
      </div>
      {fi.pressureKind != null && <FreshnessTimeline f={f} showVerdict={false} />}
      {f.cls === "crit" && (
        <p className="tl-verdict crit" style={{ marginTop: 8 }}>
          <IconLock />
          Past its use-by — do not eat
        </p>
      )}

      <div className="facts">
        <div className="fact">
          <span className="k">Amount left</span>
          <span className="v">
            {fractionLabel(lot.fractionLeft)}
            <button className="mini" onClick={() => setEditAmt((v) => !v)}>
              {editAmt ? "Done" : "Update"}
            </button>
          </span>
        </div>
        {editAmt && (
          <div className="pick" data-testid="fraction-pick">
            {FRACTIONS.map((fr) => (
              <button
                key={fr}
                className={lot.fractionLeft === fr ? "on" : undefined}
                onClick={() => onEvent("fraction_changed", fr)}
              >
                {fractionLabel(fr)}
              </button>
            ))}
          </div>
        )}
        <div className="fact">
          <span className="k">Opened</span>
          <span className="v">
            {lot.openedAt ? (
              lot.openedAt
            ) : (
              <button className="mini" onClick={() => onPatch({ openedAt: td })}>
                Mark opened today
              </button>
            )}
          </span>
        </div>
        <div className="fact">
          <span className="k">Location</span>
          <span className="v">
            <select
              className="field"
              style={{ width: 160 }}
              aria-label="Location"
              value={lot.locationId}
              onChange={(e) => onPatch({ locationId: e.target.value })}
            >
              {locs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="label">Date on the pack</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            className="field"
            style={{ maxWidth: 150 }}
            aria-label="Date type"
            value={lot.dateType ?? "best_before"}
            onChange={(e) => onPatch({ dateType: e.target.value as "use_by" | "best_before" })}
          >
            <option value="best_before">Best before</option>
            <option value="use_by">Use by</option>
          </select>
          <input
            className="field"
            type="date"
            aria-label="Date"
            value={lot.dateValue ?? ""}
            onChange={(e) => onPatch({ dateValue: e.target.value || null })}
          />
        </div>
      </div>

      {archiving ? (
        <div style={{ marginTop: 12 }}>
          <p className="label">Why remove this pack?</p>
          <div className="reasons">
            {ARCHIVE_REASONS.map((r) => (
              <button key={r} className="btn btn-line" onClick={() => onArchive(r)}>
                {REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <button className="mini" style={{ marginTop: 10 }} onClick={() => setArchiving(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="remove" onClick={() => setArchiving(true)} data-testid="archive-lot">
          Remove this pack
        </button>
      )}
    </section>
  );
}
