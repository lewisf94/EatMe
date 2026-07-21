import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Category, Location, ReceiptDraft, ReceiptLineDecision } from "@eatme/shared";
import { api, type ReceiptSummary } from "../api";
import { cls } from "../ui";

type Decision = { value: string; categoryId: string; quantity: number; locationId: string };
// value: `p:<productId>` add existing · "new" · "ignore" · "not_tracked"

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

export default function ReceiptImport() {
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
            newProduct: { name: l.normalizedText, categoryId: d.categoryId || cats[0]?.id || "" },
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

  if (summary)
    return (
      <div className="py-10 text-center">
        <p className="mb-2 text-4xl">🧾</p>
        <p className="font-semibold">Added {summary.added} to the cupboard.</p>
        <p className="mt-1 text-sm text-slate-500">
          {summary.newProducts} new · {summary.ignored} ignored · {summary.notTracked} not tracked
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/" className={cls.btn}>
            View cupboard
          </Link>
          <button
            className={cls.btnGhost}
            onClick={() => {
              setSummary(null);
              setDraft(null);
            }}
          >
            Scan another
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/add" className="text-sm text-slate-500">
          ← Add
        </Link>
        <h2 className="text-xl font-bold">Scan a receipt</h2>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!draft ? (
        <div className="py-8 text-center text-slate-500">
          <p className="mb-4">
            Photograph a receipt and confirm what to add — no typing each item.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="receipt-file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
          <button
            className={cls.btn}
            disabled={busy === "reading"}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "reading" ? "Reading…" : "📷 Choose / take a photo"}
          </button>
          <p className="mt-3 text-xs text-slate-400">
            The photo is processed on your Pi and never stored — only the parsed lines are kept.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {draft.purchase.merchant ? `${draft.purchase.merchant} · ` : ""}
            {draft.lines.length} lines — tick, fix, or ignore, then confirm.
          </p>

          <ul className="space-y-2" data-testid="receipt-review">
            {draft.lines.map((l) => {
              const d = decisions[l.id];
              return (
                <li key={l.id} className={`${cls.card} space-y-2 py-3`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-sm">{l.rawText}</span>
                    {l.lineTotal != null && (
                      <span className="shrink-0 text-xs text-slate-400">
                        £{l.lineTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <select
                    className={cls.input}
                    aria-label={`Decision for ${l.normalizedText}`}
                    value={d?.value}
                    onChange={(e) => setDec(l.id, { value: e.target.value })}
                  >
                    {l.match && (
                      <option value={`p:${l.match.productId}`}>
                        ✓ {l.match.name} ({l.match.via})
                      </option>
                    )}
                    {l.suggestions
                      .filter((s) => s.productId !== l.match?.productId)
                      .map((s) => (
                        <option key={s.productId} value={`p:${s.productId}`}>
                          {s.name}
                          {s.brand ? ` · ${s.brand}` : ""}
                        </option>
                      ))}
                    <option value="new">+ New product “{l.normalizedText}”</option>
                    <option value="ignore">Ignore this line</option>
                    <option value="not_tracked">Don’t track</option>
                  </select>

                  {(d?.value === "new" || d?.value?.startsWith("p:")) && (
                    <div className="flex gap-2">
                      {d.value === "new" && (
                        <select
                          className={cls.input}
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
                      <input
                        type="number"
                        min={1}
                        className={`${cls.input} w-20`}
                        aria-label="Quantity"
                        value={d.quantity}
                        onChange={(e) => setDec(l.id, { quantity: Math.max(1, +e.target.value) })}
                      />
                      <select
                        className={cls.input}
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            className={`w-full ${cls.btn}`}
            disabled={busy === "confirming"}
            onClick={confirm}
            data-testid="receipt-confirm"
          >
            {busy === "confirming" ? "Adding…" : "Confirm & add to cupboard"}
          </button>
        </>
      )}
    </div>
  );
}
