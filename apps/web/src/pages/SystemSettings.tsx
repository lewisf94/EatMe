import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  api,
  type AutomaticBackupStatus,
  type DatabaseIntegrity,
  type HomeAssistantStatus,
  type MagtagHealth,
  type Settings,
} from "../api";

function MagtagSection() {
  const [health, setHealth] = useState<MagtagHealth | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    Promise.all([api.magtagHealth(), api.getSettings()]).then(
      ([nextHealth, nextSettings]) => {
        setHealth(nextHealth);
        setSettings(nextSettings);
      },
      (reason) =>
        setError(reason instanceof Error ? reason.message : "Couldn’t load MagTag health"),
    );
  useEffect(() => {
    void reload();
  }, []);

  const save = (patch: Partial<Settings>) =>
    api.putSettings(patch).then(
      (next) => {
        setSettings(next);
        reload();
      },
      (reason) => setError(reason instanceof Error ? reason.message : "Couldn’t save"),
    );

  return (
    <section className="sec">
      <div className="sec-head">
        <span className="eyebrow">MagTag health</span>
      </div>
      {error && <p className="alert">{error}</p>}
      {!health ? (
        <p className="note left">Loading…</p>
      ) : (
        <>
          <div className="rgroup">
            <div className="srow">
              <span className="grow">Device token</span>
              <strong>{health.configured ? "Protected" : "Not configured"}</strong>
            </div>
            <div className="srow">
              <span className="grow">Last seen</span>
              <strong>
                {health.status ? new Date(health.status.reportedAt).toLocaleString() : "Never"}
              </strong>
            </div>
            <div className="srow">
              <span className="grow">Battery</span>
              <strong>
                {health.status?.battery == null ? "Unknown" : `${health.status.battery}%`}
              </strong>
            </div>
            <div className="srow">
              <span className="grow">Wi-Fi</span>
              <strong>
                {health.status?.rssi == null ? "Unknown" : `${health.status.rssi} dBm`}
              </strong>
            </div>
            <div className="srow">
              <span className="grow">Firmware</span>
              <strong>{health.status?.firmware ?? "Unknown"}</strong>
            </div>
            <div className="srow">
              <span className="grow">Last display check</span>
              <strong>
                {health.status?.displayUpdated == null
                  ? "Unknown"
                  : health.status.displayUpdated
                    ? "Screen updated"
                    : "Content unchanged"}
              </strong>
            </div>
            <div className="srow">
              <span className="grow">Wake duration</span>
              <strong>
                {health.status?.wakeSeconds == null
                  ? "Unknown"
                  : `${health.status.wakeSeconds.toFixed(1)} seconds`}
              </strong>
            </div>
          </div>
          {(health.isStale || health.isLowBattery) && (
            <p className="alert" style={{ marginTop: 10 }}>
              {health.isStale ? "The MagTag is overdue for a check-in. " : ""}
              {health.isLowBattery ? "Its battery is low." : ""}
            </p>
          )}
          {settings && (
            <div className="two" style={{ marginTop: 12 }}>
              <label>
                <span className="label">Stale after (hours)</span>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={336}
                  value={settings.magtag_stale_hours}
                  onChange={(event) =>
                    setSettings({ ...settings, magtag_stale_hours: Number(event.target.value) })
                  }
                  onBlur={() =>
                    void save({
                      magtag_stale_hours: Math.max(
                        1,
                        Math.min(336, settings.magtag_stale_hours || 30),
                      ),
                    })
                  }
                />
              </label>
              <label>
                <span className="label">Low battery (%)</span>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={99}
                  value={settings.magtag_low_battery}
                  onChange={(event) =>
                    setSettings({ ...settings, magtag_low_battery: Number(event.target.value) })
                  }
                  onBlur={() =>
                    void save({
                      magtag_low_battery: Math.max(
                        1,
                        Math.min(99, settings.magtag_low_battery || 20),
                      ),
                    })
                  }
                />
              </label>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function HomeAssistantSection() {
  const [status, setStatus] = useState<HomeAssistantStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([api.homeAssistantStatus(), api.getSettings()]).then(([next, settings]) => {
      setStatus(next);
      setEnabled(settings.ha_shopping_sync);
    });
  }, []);
  const sync = async () => {
    setBusy(true);
    try {
      const next = await api.syncHomeAssistant();
      setStatus(next);
      setNote(
        next.synced ? "Sensors updated in Home Assistant" : "Home Assistant could not be reached",
      );
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : "Home Assistant sync failed");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await api.putSettings({ ha_shopping_sync: next });
      setNote(
        next
          ? "New shopping changes will be mirrored to Home Assistant"
          : "Shopping mirror turned off",
      );
    } catch (reason) {
      setEnabled(!next);
      setNote(reason instanceof Error ? reason.message : "Couldn’t save the shopping mirror");
    }
  };
  return (
    <section className="sec">
      <div className="sec-head">
        <span className="eyebrow">Home Assistant</span>
      </div>
      <p className="note left" style={{ marginBottom: 10 }}>
        Publishes native expiring-soon and low-stock sensors. Shopping mirroring is one-way from
        EatMe, so EatMe stays the source of truth.
      </p>
      <div className="rgroup">
        <div className="srow">
          <span className="grow">App API</span>
          <strong>{status?.available ? "Connected" : "Unavailable outside HA"}</strong>
        </div>
        <label className="srow">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!status?.available}
            onChange={() => void toggle()}
          />
          <span className="grow">Mirror shopping changes</span>
        </label>
      </div>
      <button
        className="btn btn-line"
        style={{ marginTop: 10 }}
        disabled={!status?.available || busy}
        onClick={() => void sync()}
      >
        {busy ? "Syncing…" : "Update HA sensors now"}
      </button>
      {status?.lastSync && (
        <p className="note left tiny" style={{ marginTop: 8 }}>
          Last sensor update: {new Date(status.lastSync).toLocaleString()}
        </p>
      )}
      {(note || status?.lastError) && (
        <p className="note left tiny" style={{ marginTop: 8 }}>
          {note ?? status?.lastError}
        </p>
      )}
    </section>
  );
}

function DataSection() {
  const input = useRef<HTMLInputElement>(null);
  const [integrity, setIntegrity] = useState<DatabaseIntegrity | null>(null);
  const [backups, setBackups] = useState<AutomaticBackupStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const check = () =>
    api
      .databaseIntegrity()
      .then(setIntegrity, (reason) =>
        setNote(reason instanceof Error ? reason.message : "Check failed"),
      );
  const download = (work: () => Promise<void>) =>
    work().catch((reason) => setNote(reason instanceof Error ? reason.message : "Export failed"));
  useEffect(() => {
    void check();
    void Promise.all([api.automaticBackups(), api.getSettings()]).then(
      ([nextBackups, nextSettings]) => {
        setBackups(nextBackups);
        setSettings(nextSettings);
      },
      (reason) =>
        setNote(reason instanceof Error ? reason.message : "Couldnâ€™t load backup status"),
    );
  }, []);
  const createSnapshot = async () => {
    setSnapshotBusy(true);
    try {
      const next = await api.createAutomaticBackup();
      setBackups(next);
      setNote("Recovery snapshot created");
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : "Snapshot failed");
    } finally {
      setSnapshotBusy(false);
    }
  };
  const saveRetention = async () => {
    if (!settings) return;
    const backup_retention = Math.max(1, Math.min(30, settings.backup_retention || 7));
    try {
      const next = await api.putSettings({ backup_retention });
      setSettings(next);
      setBackups(await api.automaticBackups());
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : "Couldnâ€™t save retention");
    }
  };
  const restore = async (file: File) => {
    if (
      !window.confirm(
        "Replace all EatMe food, recipes, shopping, and history with this backup? This cannot be undone unless you export the current backup first.",
      )
    )
      return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await api.restoreBackup(parsed);
      setNote(`Restored ${result.rows} records. Reloading…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : "Restore failed");
      setBusy(false);
    }
  };
  return (
    <section className="sec">
      <div className="sec-head">
        <span className="eyebrow">Data & backups</span>
      </div>
      <p className={integrity?.ok ? "syncbar" : "alert"}>
        {integrity
          ? integrity.ok
            ? "Database check passed"
            : `Database problem: ${integrity.quickCheck}`
          : "Checking database…"}
      </p>
      <div className="rgroup" style={{ marginTop: 10 }}>
        <div className="srow">
          <span className="grow">
            <strong>Automatic recovery snapshots</strong>
            <small style={{ display: "block" }}>
              {backups?.latest
                ? `${backups.count} saved Â· latest ${new Date(backups.latest.createdAt).toLocaleString()} Â· ${Math.ceil(backups.latest.size / 1024)} KB`
                : "The first daily snapshot is created when the server starts"}
            </small>
          </span>
          <button
            className="btn btn-line"
            disabled={snapshotBusy}
            onClick={() => void createSnapshot()}
          >
            {snapshotBusy ? "Savingâ€¦" : "Create now"}
          </button>
          <button
            className="btn btn-line"
            disabled={!backups?.latest}
            onClick={() => void download(api.downloadLatestAutomaticBackup)}
          >
            Download latest
          </button>
        </div>
        {settings && (
          <label className="srow">
            <span className="grow">Snapshots to keep</span>
            <input
              className="field"
              style={{ width: 84 }}
              type="number"
              min={1}
              max={30}
              value={settings.backup_retention}
              onChange={(event) =>
                setSettings({ ...settings, backup_retention: Number(event.target.value) })
              }
              onBlur={() => void saveRetention()}
            />
          </label>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btn btn-line" onClick={() => void download(api.downloadBackup)}>
          Export full backup
        </button>
        <button className="btn btn-line" onClick={() => void download(api.downloadInventoryCsv)}>
          Export inventory CSV
        </button>
        <button className="btn btn-line" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Restoring…" : "Restore backup"}
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = "";
          }}
        />
      </div>
      {note && (
        <p className="note left tiny" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
    </section>
  );
}

export default function SystemSettings() {
  return (
    <>
      <section className="sec">
        <div className="sec-head">
          <span className="eyebrow">History & insights</span>
        </div>
        <Link className="settings-action" to="/history">
          <span>
            <strong>See recent changes and waste patterns</strong>
            <small>Undo removals, review usage, and estimate value from receipt prices</small>
          </span>
        </Link>
      </section>
      <MagtagSection />
      <HomeAssistantSection />
      <DataSection />
    </>
  );
}
