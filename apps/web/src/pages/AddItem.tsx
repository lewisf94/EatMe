import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Category, Location } from "@whattoeat/shared";
import { api } from "../api";
import { cls } from "../ui";

export default function AddItem() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [bestBefore, setBestBefore] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [saving, setSaving] = useState(false);

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

  const doLookup = async () => {
    if (!barcode) return;
    setLookupMsg("Looking up…");
    try {
      const r = await api.lookup(barcode);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const item = await api.createItem({
        name,
        brand: brand || undefined,
        barcode: barcode || undefined,
        categoryId,
        locationId,
        fractionLeft: 1,
        bestBefore: bestBefore || undefined,
      });
      nav(`/item/${item.id}`);
    } catch (err) {
      setLookupMsg(`Could not save: ${(err as Error).message}`);
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-xl font-bold">Add an item</h2>

      <div>
        <label className={cls.label} htmlFor="barcode">
          Barcode
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="barcode"
            className={cls.input}
            inputMode="numeric"
            placeholder="e.g. 5000159407236"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <button type="button" className={cls.btnGhost} onClick={doLookup}>
            Look up
          </button>
        </div>
        {lookupMsg && <p className="mt-1 text-sm text-slate-500">{lookupMsg}</p>}
        <p className="mt-1 text-xs text-slate-400">
          Camera scanning arrives in the next phase — for now type the number or fill in below.
        </p>
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

      <div>
        <label className={cls.label} htmlFor="bb">
          Best before (optional)
        </label>
        <input
          id="bb"
          type="date"
          className={cls.input}
          value={bestBefore}
          onChange={(e) => setBestBefore(e.target.value)}
        />
      </div>

      <button type="submit" className={`w-full ${cls.btn}`} disabled={saving || !name}>
        {saving ? "Saving…" : "Add to cupboard"}
      </button>
    </form>
  );
}
