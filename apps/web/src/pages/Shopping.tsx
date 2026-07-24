import { useEffect, useState } from "react";
import type { ShoppingItem } from "@eatme/shared";
import { api } from "../api";
import { IconCheck, IconPlus } from "../ui/icons";

export default function Shopping() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    api
      .shopping(true)
      .then(setItems, (e) => setError(e instanceof Error ? e.message : "Couldn’t load"))
      .finally(() => setLoading(false));
  useEffect(() => {
    void reload();
  }, []);

  const guard = (p: Promise<unknown>) =>
    p.then(reload, (e) => setError(e instanceof Error ? e.message : "Something went wrong"));

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    void guard(api.addShopping({ name }));
  };

  const tick = async (item: ShoppingItem) => {
    try {
      const { lot } = await api.tickShopping(item.id);
      // A row that came from something you finished puts a fresh pack back.
      setNote(lot ? `${item.name} is back in the cupboard` : null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t tick that off");
    }
  };

  const open = items.filter((i) => !i.doneAt);
  const done = items.filter((i) => i.doneAt);

  return (
    <>
      <header className="appbar">
        <h1>Shopping</h1>
        {open.length > 0 && <span className="sec-count">{open.length} to buy</span>}
      </header>
      <div className="screen">
        {error && <p className="alert">{error}</p>}
        {note && <p className="syncbar">{note}</p>}

        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <input
            className="field"
            value={draft}
            aria-label="Add to the list"
            placeholder="Add something…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn-primary" style={{ flex: "none" }} onClick={add}>
            <IconPlus />
            Add
          </button>
        </div>

        {loading ? (
          <p className="empty">Loading…</p>
        ) : open.length === 0 && done.length === 0 ? (
          <div className="empty">
            <p>Nothing to buy.</p>
            <p className="note tiny">Run a pack down to empty and it lands here automatically.</p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">To buy</span>
                </div>
                <div className="rgroup">
                  {open.map((i) => (
                    <div key={i.id} className="srow">
                      <button
                        className="tickbox"
                        aria-label={`Bought ${i.name}`}
                        onClick={() => void tick(i)}
                      />
                      <span className="grow">
                        {i.name}
                        {i.productId && <span className="srow-sub"> · was in your cupboard</span>}
                      </span>
                      <button
                        className="mini"
                        aria-label={`Remove ${i.name}`}
                        onClick={() => void guard(api.deleteShopping(i.id))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {done.length > 0 && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">Bought</span>
                  <span className="sec-count">{done.length}</span>
                </div>
                <div className="rgroup">
                  {done.map((i) => (
                    <div key={i.id} className="srow bought">
                      <span className="tickbox on" aria-hidden>
                        <IconCheck />
                      </span>
                      <span className="grow">{i.name}</span>
                      <button className="mini" onClick={() => void guard(api.untickShopping(i.id))}>
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
