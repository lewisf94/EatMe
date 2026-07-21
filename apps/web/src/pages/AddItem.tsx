import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { Category, Location } from "@eatme/shared";
import { api } from "../api";
import { cls } from "../ui";
import { BarcodeScanner } from "../scanner/BarcodeScanner";

export default function AddItem() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [dateType, setDateType] = useState<"best_before" | "use_by">("best_before");
  const [lookupMsg, setLookupMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void api.categories().then((c) => {
      setCats(c);
      if (c[0]) setCategoryId(c[0].id);
    });
    void api.locations().then((l) => {
      setLocs(l);
      if (l[0]) setLocationId(l[0].id);
    });
  }, []);

  const doLookup = async (code = barcode) => {
    if (!code) return;
    setLookupMsg("Looking up…");
    try {
      const r = await api.lookup(code);
      if (r.found) {
        setName(r.name ?? "");
        setBrand(r.brand ?? "");
        setLookupMsg(`Found: ${r.name ?? "(unnamed)"}`);
      } else {
        setLookupMsg("Not in Open Food Facts — enter the details manually.");
      }
    } catch (e) {
      setLookupMsg(`Lookup unavailable (${(e as Error).message}) — enter manually.`);
    }
  };

  const onScan = (value: string) => {
    setBarcode(value);
    setScanning(false);
    void doLookup(value);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { product } = await api.intake({
        name,
        brand: brand || undefined,
        barcode: barcode || undefined,
        categoryId,
        locationId,
        ...(dateValue ? { dateType, dateValue } : {}),
      });
      nav(`/product/${product.id}`);
    } catch (err) {
      setLookupMsg(`Could not save: ${(err as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Link
        to="/receipt"
        className="flex items-center justify-between rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:bg-emerald-700"
      >
        <span>🧾 Scan a receipt</span>
        <span aria-hidden>→</span>
      </Link>
      <p className="text-center text-xs text-slate-400">
        The fast way to stock up — no typing each item
      </p>

      <h2 className="pt-2 text-xl font-bold">Or add one item</h2>

      <div>
        <label className={cls.label} htmlFor="barcode">
          Barcode
        </label>
        <input
          id="barcode"
          className={`${cls.input} mt-1`}
          inputMode="numeric"
          placeholder="e.g. 5000159407236"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className={`flex-1 ${cls.btn}`} onClick={() => setScanning(true)}>
            📷 Scan
          </button>
          <button type="button" className={`flex-1 ${cls.btnGhost}`} onClick={() => doLookup()}>
            Look up typed
          </button>
        </div>
        {lookupMsg && <p className="mt-1 text-sm text-slate-500">{lookupMsg}</p>}
      </div>

      <div>
        <label className={cls.label} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          required
          className={cls.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className={cls.label} htmlFor="brand">
          Brand (optional)
        </label>
        <input
          id="brand"
          className={cls.input}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className={cls.label} htmlFor="cat">
            Category
          </label>
          <select
            id="cat"
            className={cls.input}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className={cls.label} htmlFor="loc">
            Location
          </label>
          <select
            id="loc"
            className={cls.input}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="w-36">
          <label className={cls.label} htmlFor="dt">
            Date type
          </label>
          <select
            id="dt"
            className={cls.input}
            value={dateType}
            onChange={(e) => setDateType(e.target.value as "best_before" | "use_by")}
          >
            <option value="best_before">Best before</option>
            <option value="use_by">Use by</option>
          </select>
        </div>
        <div className="flex-1">
          <label className={cls.label} htmlFor="bb">
            Date (optional)
          </label>
          <input
            id="bb"
            type="date"
            className={cls.input}
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </div>
      </div>

      <button type="submit" className={`w-full ${cls.btn}`} disabled={saving || !name}>
        {saving ? "Saving…" : "Add to cupboard"}
      </button>

      {scanning && <BarcodeScanner onDetected={onScan} onClose={() => setScanning(false)} />}
    </form>
  );
}
