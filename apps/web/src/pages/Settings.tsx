import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  DIETARY_REQUIREMENTS,
  type Category,
  type DietaryRequirement,
  type Location,
} from "@eatme/shared";
import { api, TOKEN_KEY } from "../api";
import { enablePush, disablePush, pushState, type PushState } from "../push";
import { IconBack, IconQr } from "../ui/icons";
import SystemSettings from "./SystemSettings";

/** Sparse by design: a Monday digest of what to use, and a day-before warning
 *  for anything with a use-by. */
function NotificationsSection() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  const run = async (fn: () => Promise<PushState>, after?: string) => {
    setBusy(true);
    setNote(null);
    try {
      setState(await fn());
      if (after) setNote(after);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn’t work");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sec">
      <div className="sec-head">
        <span className="eyebrow">Notifications</span>
      </div>
      <p className="note left" style={{ marginBottom: 10 }}>
        A Monday morning digest of what to use this week, plus a warning the day before anything
        hits its use-by. Nothing else.
      </p>

      {state === "unsupported" ? (
        <p className="note left tiny">
          This browser can’t do notifications. On an iPhone, add EatMe to your Home Screen first.
        </p>
      ) : state === "denied" ? (
        <p className="note left tiny">
          Notifications are blocked for EatMe — turn them back on in your browser settings.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {state === "on" ? (
            <>
              <button
                className="btn btn-line"
                disabled={busy}
                onClick={() => void run(disablePush, "Notifications turned off")}
              >
                Turn off
              </button>
              <button
                className="btn btn-line"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { sent, failed } = await api.pushTest();
                    setNote(
                      sent > 0
                        ? "Test sent — check your notifications"
                        : failed > 0
                          ? "Couldn’t reach the notification service"
                          : "No devices are subscribed yet",
                    );
                    return "on";
                  })
                }
              >
                Send a test
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy || state === null}
              onClick={() => void run(enablePush, "Notifications are on")}
            >
              {busy ? "Just a second…" : "Turn on notifications"}
            </button>
          )}
        </div>
      )}
      {note && (
        <p className="note left tiny" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
    </section>
  );
}

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

const DIETARY_LABELS: Record<DietaryRequirement, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  egg_free: "Egg-free",
  nut_free: "Nut-free",
};

export default function Settings() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [newLoc, setNewLoc] = useState("");
  const [newCat, setNewCat] = useState("");
  const [tz, setTz] = useState("");
  const [tzSaved, setTzSaved] = useState(false);
  const [dietary, setDietary] = useState<DietaryRequirement[]>([]);
  const [dietarySaved, setDietarySaved] = useState(false);
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
    void guard(
      api.getSettings().then((s) => {
        setTz(s.household_timezone);
        setDietary(s.dietary_requirements);
      }),
    );
  };
  useEffect(reload, []);

  const saveTz = async (value: string) => {
    await guard(
      api.putSettings({ household_timezone: value }).then((s) => setTz(s.household_timezone)),
    );
    setTzSaved(true);
    setTimeout(() => setTzSaved(false), 2000);
  };

  const toggleDietary = async (requirement: DietaryRequirement) => {
    const next = dietary.includes(requirement)
      ? dietary.filter((item) => item !== requirement)
      : [...dietary, requirement];
    setDietary(next);
    await guard(
      api
        .putSettings({ dietary_requirements: next })
        .then((settings) => setDietary(settings.dietary_requirements)),
    );
    setDietarySaved(true);
    setTimeout(() => setDietarySaved(false), 2000);
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
            <span className="eyebrow">Dietary requirements</span>
            {dietarySaved && <span className="saved">Saved</span>}
          </div>
          <p className="note left" style={{ marginBottom: 10 }}>
            Use-it-up suggestions and starter-recipe imports will only include compatible recipes.
            Always check ingredient labels for allergies and cross-contamination.
          </p>
          <div className="rgroup">
            {DIETARY_REQUIREMENTS.map((requirement) => (
              <label key={requirement} className="srow">
                <input
                  type="checkbox"
                  checked={dietary.includes(requirement)}
                  onChange={() => void toggleDietary(requirement)}
                />
                <span className="grow">{DIETARY_LABELS[requirement]}</span>
              </label>
            ))}
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

        <NotificationsSection />

        <SystemSettings />

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Container labels</span>
          </div>
          <Link className="settings-action" to="/labels">
            <IconQr />
            <span>
              <strong>Choose and print labels</strong>
              <small>Reusable QR labels for your jars, tubs, and packs</small>
            </span>
          </Link>
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
