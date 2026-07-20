import type { Status } from "@whattoeat/shared";

export const STATUS_META: Record<Status, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-slate-100 text-slate-600" },
  use_soon: { label: "Use soon", cls: "bg-amber-100 text-amber-800" },
  past_best: { label: "Past its best", cls: "bg-orange-100 text-orange-800" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-800" },
};

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function FractionBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" title={`${pct}% left`}>
      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fractionLabel(f: number): string {
  if (f >= 1) return "Full";
  if (f >= 0.75) return "¾";
  if (f >= 0.5) return "½";
  if (f >= 0.25) return "¼";
  if (f > 0) return "Nearly empty";
  return "Empty";
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A friendly "use in N days" / "N days ago" from computeStatus daysLeft. */
export function daysPhrase(daysLeft: number | null): string {
  if (daysLeft == null) return "no date set";
  if (daysLeft < 0) return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "today";
  return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

// Shared Tailwind class strings, kept in one place for consistency.
export const cls = {
  input:
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200",
  label: "block text-sm font-medium text-slate-700",
  btn: "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 font-semibold text-white active:bg-emerald-700 disabled:opacity-50",
  btnGhost:
    "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 font-medium text-slate-700 active:bg-slate-100",
  card: "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
};
