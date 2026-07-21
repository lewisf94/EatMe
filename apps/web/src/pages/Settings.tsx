import { useEffect, useState } from "react";
import type { Category, Location } from "@whattoeat/shared";
import { api, TOKEN_KEY } from "../api";
import { cls } from "../ui";

// A small, robust set of household timezones; the stored value is unioned in so
// an unusual zone set elsewhere still shows up as the selected option.
const COMMON_TZS = [
  "Europe/London",
  "Europe/Dublin",
  "UTC",
  "Europe/Paris",
  "Europe/Madrid",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export default function Settings() {
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [newLoc, setNewLoc] = useState("");
  const [newCat, setNewCat] = useState("");
  const [tz, setTz] = useState("");
  const [tzSaved, setTzSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [tokenSaved, setTokenSaved] = useState(false);

  const guard = (p: Promise<unknown>) =>
    p.catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"));

  const saveToken = () => {
    if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  const reload = () => {
    void guard(api.categories().then(setCats));
    void guard(api.locations().then(setLocs));
    void guard(api.getSettings().then((s) => setTz(s.household_timezone)));
  };
  useEffect(reload, []);

  const saveTz = async (value: string) => {
    await guard(
      api.putSettings({ household_timezone: value }).then((s) => setTz(s.household_timezone)),
    );
    setTzSaved(true);
    setTimeout(() => setTzSaved(false), 2000);
  };

  const addLocation = async () => {
    if (!newLoc.trim()) return;
    await guard(api.createLocation({ name: newLoc.trim(), sortOrder: locs.length }));
    setNewLoc("");
    reload();
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    await guard(api.createCategory({ name: newCat.trim(), warnDays: 14, hardExpiry: false }));
    setNewCat("");
    reload();
  };

  const renameLocation = async (l: Location, name: string) => {
    if (name.trim() && name.trim() !== l.name)
      await guard(api.patchLocation(l.id, { name: name.trim() }));
    setEditing(null);
    reload();
  };

  const tzOptions = Array.from(new Set([tz, ...COMMON_TZS].filter(Boolean)));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <section>
        <h3 className="mb-2 font-semibold">Household timezone</h3>
        <p className="mb-2 text-sm text-slate-500">
          Used to decide which day “today” is, so freshness is right near midnight.
        </p>
        <div className="flex gap-2">
          <select
            className={cls.input}
            value={tz}
            aria-label="Household timezone"
            onChange={(e) => void saveTz(e.target.value)}
          >
            {tzOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {tzSaved && <span className="self-center text-sm text-emerald-600">Saved</span>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Locations</h3>
        <ul className="mb-2 space-y-1">
          {locs.map((l) => (
            <li key={l.id} className={`${cls.card} flex items-center gap-2 py-2`}>
              {editing === `loc:${l.id}` ? (
                <input
                  autoFocus
                  className={cls.input}
                  defaultValue={l.name}
                  aria-label={`Rename ${l.name}`}
                  onBlur={(e) => void renameLocation(l, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <>
                  <span className="flex-1">{l.name}</span>
                  <button
                    className="text-sm text-emerald-600"
                    onClick={() => setEditing(`loc:${l.id}`)}
                  >
                    Rename
                  </button>
                </>
              )}
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
            <CategoryRow
              key={c.id}
              cat={c}
              open={editing === `cat:${c.id}`}
              onOpen={() => setEditing(`cat:${c.id}`)}
              onClose={() => setEditing(null)}
              onSave={async (patch) => {
                await guard(api.patchCategory(c.id, patch));
                setEditing(null);
                reload();
              }}
            />
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

      <section>
        <h3 className="mb-2 font-semibold">Access token</h3>
        <p className="mb-2 text-sm text-slate-500">
          Only needed if you set an <code>auth_token</code> in the Home Assistant add-on. Paste the
          same value here so this device can reach the server.
        </p>
        <div className="flex gap-2">
          <input
            className={cls.input}
            type="password"
            placeholder="(none)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className={cls.btn} onClick={saveToken}>
            {tokenSaved ? "Saved" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** One category row: a summary line, expanding to an editor for name +
 *  freshness rules (warn window, open-life, hard-expiry). */
function CategoryRow({
  cat,
  open,
  onOpen,
  onClose,
  onSave,
}: {
  cat: Category;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (patch: {
    name?: string;
    warnDays?: number;
    openLifeDays?: number | null;
    hardExpiry?: boolean;
  }) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [warnDays, setWarnDays] = useState(String(cat.warnDays));
  const [openLife, setOpenLife] = useState(
    cat.openLifeDays == null ? "" : String(cat.openLifeDays),
  );
  const [hardExpiry, setHardExpiry] = useState(cat.hardExpiry);

  if (!open) {
    return (
      <li className={`${cls.card} flex items-center justify-between gap-2 py-2`}>
        <span>{cat.name}</span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {cat.openLifeDays ? `${cat.openLifeDays}d open-life` : "best-before only"}
            {cat.hardExpiry ? " · hard expiry" : ""}
          </span>
          <button className="text-sm text-emerald-600" onClick={onOpen}>
            Edit
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className={`${cls.card} space-y-3 py-3`}>
      <div>
        <label className={cls.label}>Name</label>
        <input className={cls.input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={cls.label}>Warn (days)</label>
          <input
            className={cls.input}
            type="number"
            inputMode="numeric"
            value={warnDays}
            onChange={(e) => setWarnDays(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className={cls.label}>Open-life (days)</label>
          <input
            className={cls.input}
            type="number"
            inputMode="numeric"
            placeholder="none"
            value={openLife}
            onChange={(e) => setOpenLife(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hardExpiry}
          onChange={(e) => setHardExpiry(e.target.checked)}
        />
        Hard expiry (past the date = unsafe, not just past its best)
      </label>
      <div className="flex gap-2">
        <button
          className={cls.btn}
          onClick={() =>
            onSave({
              name: name.trim() || cat.name,
              warnDays: Number(warnDays) || 0,
              openLifeDays: openLife.trim() === "" ? null : Number(openLife),
              hardExpiry,
            })
          }
        >
          Save
        </button>
        <button className={cls.btnGhost} onClick={onClose}>
          Cancel
        </button>
      </div>
    </li>
  );
}
