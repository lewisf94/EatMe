import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  Category,
  Location,
  ReceiptDraft,
  ReceiptDraftLine,
  ReceiptLineDecision,
} from "@eatme/shared";
import { api, type ReceiptSummary } from "../api";
import { IconBack, IconCamera, IconCheck, IconReceipt, IconPlus, IconMinus } from "../ui/icons";

type Decision = {
  value: string; // `p:<productId>` add existing · "new" · "ignore" · "not_tracked"
  name: string; // editable name when creating a new product
  categoryId: string;
  quantity: number;
  locationId: string;
};

/** Receipt text is usually shouted in caps ("MANGO CHUTNEY") — gently title-case
 *  it so a new product name reads like a name, still fully editable. */
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Name to show for a line that's being added to an existing/suggested product. */
function chosenName(l: ReceiptDraftLine, value: string): string {
  const id = value.slice(2);
  if (l.match?.productId === id) return l.match.name;
  return l.suggestions.find((s) => s.productId === id)?.name ?? titleCase(l.normalizedText);
}

/** Downscale + re-encode to JPEG. Drawing through a canvas also strips EXIF, so
 *  no location/time metadata leaves the device. */
async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="One fewer" onClick={() => onChange(Math.max(1, value - 1))}>
        <IconMinus />
      </button>
      <span className="stepper-n">{value}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(value + 1)}>
        <IconPlus />
      </button>
    </span>
  );
}

export default function ReceiptImport() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<"" | "reading" | "confirming">("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReceiptSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  }, []);

  const onFile = async (file: File) => {
    setError(null);
    setBusy("reading");
    try {
      const blob = await compressImage(file);
      const d = await api.uploadReceipt(blob);
      setDraft(d);
      const defLoc = locs[0]?.id ?? "";
      const defCat = cats[0]?.id ?? "";
      setDecisions(
        Object.fromEntries(
          d.lines.map((l) => [
            l.id,
            {
              value: l.match ? `p:${l.match.productId}` : "new",
              name: titleCase(l.normalizedText),
              categoryId: defCat,
              quantity: l.quantity,
              locationId: defLoc,
            } as Decision,
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that receipt");
    } finally {
      setBusy("");
    }
  };

  const setDec = (id: string, patch: Partial<Decision>) =>
    setDecisions((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const confirm = async () => {
    if (!draft) return;
    setBusy("confirming");
    setError(null);
    try {
      const lines: ReceiptLineDecision[] = draft.lines.map((l) => {
        const d = decisions[l.id];
        if (d.value === "ignore") return { lineId: l.id, action: "ignore", quantity: d.quantity };
        if (d.value === "not_tracked")
          return { lineId: l.id, action: "not_tracked", quantity: d.quantity };
        if (d.value === "new")
          return {
            lineId: l.id,
            action: "add",
            newProduct: {
              name: d.name.trim() || l.normalizedText,
              categoryId: d.categoryId || cats[0]?.id || "",
            },
            quantity: d.quantity,
            locationId: d.locationId || undefined, // server falls back to a default
          };
        return {
          lineId: l.id,
          action: "add",
          productId: d.value.slice(2),
          quantity: d.quantity,
          locationId: d.locationId || undefined,
        };
      });
      setSummary(await api.confirmReceipt(draft.purchase.id, { lines }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
    } finally {
      setBusy("");
    }
  };

  const bar = (title: string) => (
    <header className="appbar">
      <div className="bar-left">
        <button className="iconbtn" onClick={() => nav("/add")} aria-label="Back">
          <IconBack />
        </button>
        <h1>{title}</h1>
      </div>
    </header>
  );

  // ---- success -----------------------------------------------------------
  if (summary)
    return (
      <>
        {bar("All done")}
        <div className="screen">
          <div className="capture">
            <div className="capture-badge done">
              <IconCheck />
            </div>
            <h2>Added {summary.added} to the cupboard</h2>
            <p className="note">
              {summary.newProducts} new · {summary.ignored} ignored · {summary.notTracked} not
              tracked
            </p>
            <div className="capture-actions">
              <Link to="/" className="btn btn-line">
                View cupboard
              </Link>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSummary(null);
                  setDraft(null);
                }}
              >
                Scan another
              </button>
            </div>
          </div>
        </div>
      </>
    );

  // ---- capture -----------------------------------------------------------
  if (!draft)
    return (
      <>
        {bar("Scan a receipt")}
        <div className="screen">
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="capture">
            <div className="capture-badge">
              <IconReceipt />
            </div>
            <h2>Snap the receipt</h2>
            <p className="note">Photograph it and confirm what to add — no typing each item.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              data-testid="receipt-file"
              hidden
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
            <button
              className="btn btn-primary"
              disabled={busy === "reading"}
              onClick={() => fileRef.current?.click()}
            >
              <IconCamera />
              {busy === "reading" ? "Reading…" : "Take a photo"}
            </button>
            <p className="note tiny">
              Read on your Pi and never stored — only the parsed lines are kept.
            </p>
          </div>
        </div>
      </>
    );

  // ---- review ------------------------------------------------------------
  const off = (v?: string) => v === "ignore" || v === "not_tracked";
  const needs: ReceiptDraftLine[] = [];
  const matched: ReceiptDraftLine[] = [];
  const notFood: ReceiptDraftLine[] = [];
  for (const l of draft.lines) {
    const d = decisions[l.id];
    if (off(d?.value)) notFood.push(l);
    else if (l.match) matched.push(l);
    else needs.push(l);
  }
  const addCount = draft.lines.length - notFood.length;

  const renderLine = (l: ReceiptDraftLine) => {
    const d = decisions[l.id];
    if (!d) return null;

    if (off(d.value))
      return (
        <div key={l.id} className="rline off" data-testid="receipt-line">
          <div className="rline-head">
            <span className="rline-name">{titleCase(l.normalizedText)}</span>
            <button
              className="mini"
              onClick={() => setDec(l.id, { value: l.match ? `p:${l.match.productId}` : "new" })}
            >
              Add it back
            </button>
          </div>
          <div className="rline-sub">
            {d.value === "not_tracked" ? "Not tracked" : "Ignored"} · {l.rawText}
          </div>
        </div>
      );

    const adding = d.value === "new" || d.value.startsWith("p:");
    return (
      <div key={l.id} className="rline" data-testid="receipt-line">
        <div className="rline-head">
          {d.value === "new" ? (
            <input
              className="field rline-name-input"
              aria-label={`Name for ${l.rawText}`}
              value={d.name}
              onChange={(e) => setDec(l.id, { name: e.target.value })}
            />
          ) : (
            <span className="rline-name">
              {chosenName(l, d.value)}
              <span className="rmatch">
                <IconCheck />
                {l.match && d.value === `p:${l.match.productId}` ? "Matched" : "Chosen"}
              </span>
            </span>
          )}
          <Stepper value={d.quantity} onChange={(n) => setDec(l.id, { quantity: n })} />
        </div>
        <div className="rline-sub">
          {l.rawText}
          {l.lineTotal != null ? ` · £${l.lineTotal.toFixed(2)}` : ""}
        </div>
        <div className="rline-controls">
          <select
            className="field"
            aria-label={`Decision for ${l.normalizedText}`}
            value={d.value}
            onChange={(e) => setDec(l.id, { value: e.target.value })}
          >
            {l.match && <option value={`p:${l.match.productId}`}>✓ {l.match.name}</option>}
            {l.suggestions
              .filter((s) => s.productId !== l.match?.productId)
              .map((s) => (
                <option key={s.productId} value={`p:${s.productId}`}>
                  {s.name}
                  {s.brand ? ` · ${s.brand}` : ""}
                </option>
              ))}
            <option value="new">+ New product</option>
            <option value="ignore">Ignore this line</option>
            <option value="not_tracked">Not food — don’t track</option>
          </select>
          {d.value === "new" && (
            <select
              className="field"
              aria-label="Category"
              value={d.categoryId}
              onChange={(e) => setDec(l.id, { categoryId: e.target.value })}
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {adding && (
            <select
              className="field"
              aria-label="Location"
              value={d.locationId}
              onChange={(e) => setDec(l.id, { locationId: e.target.value })}
            >
              {locs.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  const section = (title: string, lines: ReceiptDraftLine[], hint?: string) =>
    lines.length === 0 ? null : (
      <section className="sec">
        <div className="sec-head">
          <span className="eyebrow">{title}</span>
          <span className="sec-count">{lines.length}</span>
        </div>
        {hint && <p className="note left">{hint}</p>}
        <div className="rgroup">{lines.map(renderLine)}</div>
      </section>
    );

  return (
    <>
      {bar("Review receipt")}
      <div className="screen" data-testid="receipt-review">
        <p className="stock-line">
          {draft.purchase.merchant ? `${draft.purchase.merchant} · ` : ""}
          {draft.lines.length} lines found — tick, fix, or skip.
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {section("Needs your help", needs, "No match found — name it, categorise it, or skip it.")}
        {section("Matched automatically", matched)}
        {section("Not food", notFood)}

        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 20 }}
          disabled={busy === "confirming" || addCount === 0}
          onClick={confirm}
          data-testid="receipt-confirm"
        >
          {busy === "confirming"
            ? "Adding…"
            : `Add ${addCount} ${addCount === 1 ? "item" : "items"} to the cupboard`}
        </button>
      </div>
    </>
  );
}
