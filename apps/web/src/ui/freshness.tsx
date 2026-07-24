import { Link } from "react-router-dom";
import { computeStatus, type Status, type DateType, type StockLot } from "@eatme/shared";
import { IconLock, IconLeaf, IconDrop, IconClock } from "./icons";

type Kind = DateType | "open_life" | null;

/** The freshness inputs a row or a single lot supplies. */
export type FreshInput = {
  status: Status;
  pressureKind: Kind;
  pressureDate: string | null;
  daysLeft: number | null;
  startDate: string | null;
  startKind: "opened" | "purchased" | "added" | null;
};

export type Fresh = {
  cls: "crit" | "warn" | "qual" | "open" | "calm" | "none";
  kind: Kind;
  verdict: string;
  pct: number | null; // today's position along the track, 0..100
  startLabel: string;
  targetLabel: string;
};

const UTC = { timeZone: "UTC" } as const;
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...UTC }).format(
    new Date(iso + "T00:00:00Z"),
  );
const fmtTarget = (iso: string, today: string) =>
  iso.slice(0, 4) !== today.slice(0, 4)
    ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", ...UTC }).format(
        new Date(iso + "T00:00:00Z"),
      )
    : fmtDay(iso);

/** Which semantic treatment a state gets — safety, quality and open-life read
 *  differently, and colour is only ever one of three cues (with words + icon). */
function classOf(status: Status, kind: Kind): Fresh["cls"] {
  if (kind == null) return "none";
  if (status === "past_use_by") return "crit";
  if (status === "past_best") return "qual";
  if (status === "quality_declining") return "open";
  if (status === "use_soon")
    return kind === "use_by" ? "warn" : kind === "best_before" ? "qual" : "open";
  return "calm";
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
function until(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 60) return `in ${days(n)}`;
  if (n < 730) return `in ${Math.round(n / 30)} months`;
  return `in ${Math.round(n / 365)} year${n < 550 ? "" : "s"}`;
}

function verdictOf(status: Status, kind: Kind, daysLeft: number | null): string {
  if (kind == null) return "No date yet";
  const d = daysLeft ?? 0;
  switch (status) {
    case "past_use_by":
      return "Past use-by — do not eat";
    case "past_best":
      return -d <= 60 ? `Past its best by ${days(-d)}` : "Past its best";
    case "quality_declining":
      return "Opened — check quality";
    case "use_soon":
      if (kind === "use_by") return d <= 0 ? "Use by today" : `Use by ${until(d)}`;
      if (kind === "best_before") return d <= 0 ? "Best before today" : `Best before ${until(d)}`;
      return d <= 0 ? "Opened — use today" : `Use within ${days(d)} of opening`;
    default:
      if (kind === "use_by") return `Use by ${until(d)}`;
      if (kind === "open_life") return `Best used by ${until(d)}`;
      return `Best before ${until(d)}`;
  }
}

const startWord = { opened: "Opened", purchased: "Bought", added: "Added" } as const;

export function freshOf(x: FreshInput, today: string): Fresh {
  const cls = classOf(x.status, x.pressureKind);
  let pct: number | null = null;
  if (x.startDate && x.pressureDate) {
    const s = Date.parse(x.startDate + "T00:00:00Z");
    const t = Date.parse(x.pressureDate + "T00:00:00Z");
    const n = Date.parse(today + "T00:00:00Z");
    pct = t <= s ? 100 : Math.max(0, Math.min(100, ((n - s) / (t - s)) * 100));
  }
  return {
    cls,
    kind: x.pressureKind,
    verdict: verdictOf(x.status, x.pressureKind, x.daysLeft),
    pct,
    startLabel:
      x.startKind && x.startDate ? `${startWord[x.startKind]} ${fmtDay(x.startDate)}` : "",
    targetLabel: x.pressureDate ? fmtTarget(x.pressureDate, today) : "",
  };
}

/** Derive freshness inputs for a single stock lot (mirrors the server's rollup:
 *  an open-life clock starts when opened, else the track starts at purchase/add). */
export function lotFreshInput(
  lot: StockLot,
  category: { openLifeDays: number | null; warnDays: number },
  today: string,
): FreshInput {
  const s = computeStatus(lot, category, today);
  let startDate: string | null;
  let startKind: FreshInput["startKind"];
  if (s.pressureKind === "open_life" && lot.openedAt) {
    startDate = lot.openedAt;
    startKind = "opened";
  } else if (lot.purchasedAt) {
    startDate = lot.purchasedAt;
    startKind = "purchased";
  } else {
    startDate = lot.createdAt.slice(0, 10);
    startKind = "added";
  }
  return {
    status: s.status,
    pressureKind: s.pressureKind,
    pressureDate: s.pressureDate,
    daysLeft: s.daysLeft,
    startDate,
    startKind,
  };
}

/** Uppercase label for the governing clock, for the product verdict header. */
export function clockLabel(kind: Kind): string {
  if (kind === "use_by") return "Use by";
  if (kind === "open_life") return "Best used by";
  if (kind === "best_before") return "Best before";
  return "No date";
}

/** The icon that matches the governing clock (a third, non-colour cue). */
export function ClockIcon({ kind }: { kind: Kind }) {
  if (kind === "use_by") return <IconLock />;
  if (kind === "best_before") return <IconLeaf />;
  if (kind === "open_life") return <IconDrop />;
  return <IconClock />;
}

/** The freshness timeline: bought/opened → today → due. Shows an explicit verdict
 *  (never colour alone) and, when there's no start+due, a dotted "no date" track. */
export function FreshnessTimeline({
  f,
  showVerdict = true,
  addDateHref,
}: {
  f: Fresh;
  showVerdict?: boolean;
  addDateHref?: string;
}) {
  return (
    <div className={`tl ${f.cls}`}>
      {showVerdict && (
        <div className="tl-verdict">
          <ClockIcon kind={f.kind} />
          {f.verdict}
        </div>
      )}
      {f.cls === "none" || f.pct == null ? (
        <>
          <div className="tl-track" />
          <div className="tl-ends">
            <span>{f.startLabel || "No date"}</span>
            {addDateHref ? <span className="mini">Add a date →</span> : <span />}
          </div>
        </>
      ) : (
        <>
          <div className="tl-track">
            <span className="tl-fill" style={{ width: `${f.pct}%` }} />
            <span className="tl-today" style={{ left: `${f.pct}%` }} />
          </div>
          <div className="tl-ends">
            <span>{f.startLabel}</span>
            <span>{f.targetLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** How much is left, as a small secondary signal. */
export function qtyLabel(totalCount: number, fractionLeft: number | null): string {
  if (totalCount > 1) return `${totalCount} packs`;
  const f = fractionLeft;
  if (f == null) return "";
  if (f >= 1) return "Full";
  if (f <= 0) return "Empty";
  if (f >= 0.7) return "¾ left";
  if (f >= 0.4) return "½ left";
  if (f >= 0.15) return "¼ left";
  return "Nearly empty";
}

type Row = FreshInput & {
  productId: string;
  name: string;
  brand: string | null;
  locationId: string | null;
  totalCount: number;
  fractionLeft: number | null;
};

/** One compact cupboard row: name + quantity, brand/location, then the timeline. */
export function ProductRow({
  row,
  locName,
  today,
}: {
  row: Row;
  locName: (id: string | null) => string;
  today: string;
}) {
  const f = freshOf(row, today);
  const meta = [
    row.brand,
    locName(row.locationId),
    row.startKind === "opened" && row.startDate ? `opened ${fmtDay(row.startDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link className="row" data-testid="inventory-row" to={`/product/${row.productId}`}>
      <div className="row-top">
        <span className="name">{row.name}</span>
        <span className="qty">{qtyLabel(row.totalCount, row.fractionLeft)}</span>
      </div>
      {meta && <div className="row-meta">{meta}</div>}
      <FreshnessTimeline
        f={f}
        addDateHref={row.pressureKind == null ? `/product/${row.productId}` : undefined}
      />
    </Link>
  );
}
