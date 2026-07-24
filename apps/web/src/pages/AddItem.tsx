import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { Category, Location } from "@eatme/shared";
import { api } from "../api";
import { BarcodeScanner } from "../scanner/BarcodeScanner";
import { IconReceipt, IconCamera } from "../ui/icons";

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
    <>
      <header className="appbar">
        <h1>Add to cupboard</h1>
      </header>
      <div className="screen">
        <Link to="/receipt" className="feature">
          <span className="fic">
            <IconReceipt />
          </span>
          <span className="ft">
            <b>Scan a receipt</b>
            <span>Stock up fast — no typing each item</span>
          </span>
          <span className="arr" aria-hidden>
            →
          </span>
        </Link>

        <div className="sec-head" style={{ marginTop: 22, marginBottom: 12 }}>
          <span className="eyebrow">Or add one item</span>
        </div>

        <form className="form" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="barcode">
              Barcode
            </label>
            <input
              id="barcode"
              className="field"
              inputMode="numeric"
              placeholder="e.g. 5000159407236"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <div className="two" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-line" onClick={() => setScanning(true)}>
                <IconCamera />
                Scan
              </button>
              <button type="button" className="btn btn-line" onClick={() => doLookup()}>
                Look up typed
              </button>
            </div>
            {lookupMsg && (
              <p className="note left" style={{ marginTop: 6 }}>
                {lookupMsg}
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              required
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="brand">
              Brand (optional)
            </label>
            <input
              id="brand"
              className="field"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>

          <div className="two">
            <div>
              <label className="label" htmlFor="cat">
                Category
              </label>
              <select
                id="cat"
                className="field"
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
            <div>
              <label className="label" htmlFor="loc">
                Location
              </label>
              <select
                id="loc"
                className="field"
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

          <div className="two">
            <div>
              <label className="label" htmlFor="dt">
                Date type
              </label>
              <select
                id="dt"
                className="field"
                value={dateType}
                onChange={(e) => setDateType(e.target.value as "best_before" | "use_by")}
              >
                <option value="best_before">Best before</option>
                <option value="use_by">Use by</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bb">
                Date (optional)
              </label>
              <input
                id="bb"
                type="date"
                className="field"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 4 }}
            disabled={saving || !name}
          >
            {saving ? "Saving…" : "Add to cupboard"}
          </button>
        </form>

        {scanning && <BarcodeScanner onDetected={onScan} onClose={() => setScanning(false)} />}
      </div>
    </>
  );
}
