import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Category, Location } from "@eatme/shared";
import { api, TOKEN_KEY } from "../api";
import { IconBack } from "../ui/icons";

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
  const nav = useNavigate();
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
    await guard(api.createCategory({ name: newCat.trim(), warnDays: 14 }));
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
    <>
      <header className="appbar">
        <div className="bar-left">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="screen">
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Household timezone</span>
          </div>
          <p className="note left" style={{ marginBottom: 10 }}>
            Used to decide which day “today” is, so freshness is right near midnight.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              className="field"
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
            {tzSaved && <span className="saved">Saved</span>}
          </div>
        </section>

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Locations</span>
          </div>
          <div className="rgroup">
            {locs.map((l) => (
              <div key={l.id} className="srow">
                {editing === `loc:${l.id}` ? (
                  <input
                    autoFocus
                    className="field"
                    defaultValue={l.name}
                    aria-label={`Rename ${l.name}`}
                    onBlur={(e) => void renameLocation(l, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <>
                    <span className="grow">{l.name}</span>
                    <button className="mini" onClick={() => setEditing(`loc:${l.id}`)}>
                      Rename
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              className="field"
              placeholder="New location"
              value={newLoc}
              onChange={(e) => setNewLoc(e.target.value)}
            />
            <button className="btn btn-line" style={{ flex: "none" }} onClick={addLocation}>
              Add
            </button>
          </div>
        </section>

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Categories</span>
          </div>
          <div className="rgroup">
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
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              className="field"
              placeholder="New category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <button className="btn btn-line" style={{ flex: "none" }} onClick={addCategory}>
              Add
            </button>
          </div>
        </section>

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Access token</span>
          </div>
          <p className="note left" style={{ marginBottom: 10 }}>
            Only needed if you set an <code>auth_token</code> in the Home Assistant add-on. Paste
            the same value here so this device can reach the server.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="field"
              type="password"
              placeholder="(none)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn btn-line" style={{ flex: "none" }} onClick={saveToken}>
              {tokenSaved ? "Saved" : "Save"}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

/** One category row: a summary line, expanding to an editor for name +
 *  freshness defaults (warn window, open-life). */
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
  onSave: (patch: { name?: string; warnDays?: number; openLifeDays?: number | null }) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [warnDays, setWarnDays] = useState(String(cat.warnDays));
  const [openLife, setOpenLife] = useState(
    cat.openLifeDays == null ? "" : String(cat.openLifeDays),
  );

  if (!open) {
    return (
      <div className="srow">
        <span className="grow">{cat.name}</span>
        <span className="srow-sub">
          {cat.openLifeDays ? `${cat.openLifeDays}d open-life` : "best-before only"}
        </span>
        <button className="mini" onClick={onOpen}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="srow" style={{ display: "block" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="two">
          <div>
            <label className="label">Warn (days)</label>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              value={warnDays}
              onChange={(e) => setWarnDays(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Open-life (days)</label>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              placeholder="none"
              value={openLife}
              onChange={(e) => setOpenLife(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() =>
              onSave({
                name: name.trim() || cat.name,
                warnDays: Number(warnDays) || 0,
                openLifeDays: openLife.trim() === "" ? null : Number(openLife),
              })
            }
          >
            Save
          </button>
          <button className="btn btn-line" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
