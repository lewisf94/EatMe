import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type LabelContainer } from "../api";
import { printLabelSheet } from "../labels";
import { IconBack, IconQr } from "../ui/icons";

export default function Labels() {
  const nav = useNavigate();
  const [containers, setContainers] = useState<LabelContainer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.labelContainers().then(
      (items) => {
        setContainers(items);
        setSelected(new Set(items.map((item) => item.id)));
        setLoading(false);
      },
      (reason) => {
        setError(reason instanceof Error ? reason.message : "Couldn’t load labels");
        setLoading(false);
      },
    );
  }, []);

  const selectedIds = useMemo(
    () => containers.filter((item) => selected.has(item.id)).map((item) => item.id),
    [containers, selected],
  );

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const print = async () => {
    setPrinting(true);
    setError(null);
    try {
      await printLabelSheet(selectedIds);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t prepare labels");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <header className="appbar">
        <div className="bar-left">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <h1>Labels</h1>
        </div>
      </header>
      <div className="screen">
        <section className="sec labels-intro">
          <IconQr />
          <div>
            <h2>Print reusable container labels</h2>
            <p>Scan a label to jump straight to that product’s quick update screen.</p>
          </div>
        </section>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <section className="sec">
          <div className="sec-head">
            <span className="eyebrow">Containers</span>
            {containers.length > 0 && (
              <button
                className="mini"
                onClick={() =>
                  setSelected(
                    selected.size === containers.length
                      ? new Set()
                      : new Set(containers.map((item) => item.id)),
                  )
                }
              >
                {selected.size === containers.length ? "Clear" : "Select all"}
              </button>
            )}
          </div>

          {loading ? (
            <p className="empty">Loading…</p>
          ) : containers.length === 0 ? (
            <p className="empty">Add some food first. Each new container gets a reusable label.</p>
          ) : (
            <div className="label-list">
              {containers.map((container) => (
                <label className="label-choice" key={container.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(container.id)}
                    onChange={() => toggle(container.id)}
                  />
                  <span className="label-choice-copy">
                    <strong>{container.displayName}</strong>
                    <span>
                      {[container.productName, container.locationName].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {containers.length > 0 && (
          <button
            className="btn btn-primary label-print"
            disabled={selectedIds.length === 0 || printing}
            onClick={() => void print()}
          >
            <IconQr />
            {printing
              ? "Preparing…"
              : `Print ${selectedIds.length} ${selectedIds.length === 1 ? "label" : "labels"}`}
          </button>
        )}
      </div>
    </>
  );
}
