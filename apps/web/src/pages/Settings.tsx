import { useEffect, useState } from "react";
import type { Category, Location } from "@whattoeat/shared";
import { api } from "../api";
import { cls } from "../ui";

export default function Settings() {
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [newLoc, setNewLoc] = useState("");
  const [newCat, setNewCat] = useState("");

  const reload = () => {
    void api.categories().then(setCats);
    void api.locations().then(setLocs);
  };
  useEffect(reload, []);

  const addLocation = async () => {
    if (!newLoc.trim()) return;
    await api.createLocation({ name: newLoc.trim(), sortOrder: locs.length });
    setNewLoc("");
    reload();
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    await api.createCategory({ name: newCat.trim(), warnDays: 14, hardExpiry: false });
    setNewCat("");
    reload();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      <section>
        <h3 className="mb-2 font-semibold">Locations</h3>
        <ul className="mb-2 space-y-1">
          {locs.map((l) => (
            <li key={l.id} className={`${cls.card} py-2`}>
              {l.name}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={cls.input}
            placeholder="New location"
            value={newLoc}
            onChange={(e) => setNewLoc(e.target.value)}
          />
          <button className={cls.btn} onClick={addLocation}>
            Add
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Categories</h3>
        <ul className="mb-2 space-y-1">
          {cats.map((c) => (
            <li key={c.id} className={`${cls.card} flex items-center justify-between py-2`}>
              <span>{c.name}</span>
              <span className="text-xs text-slate-400">
                {c.openLifeDays ? `${c.openLifeDays}d open-life` : "best-before only"}
                {c.hardExpiry ? " · hard expiry" : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={cls.input}
            placeholder="New category"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className={cls.btn} onClick={addCategory}>
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
