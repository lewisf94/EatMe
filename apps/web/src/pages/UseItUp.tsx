import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { InventoryRow, UseItUpHit } from "@eatme/shared";
import { api } from "../api";
import { today } from "../ui";
import { ProductRow } from "../ui/freshness";
import { IconLeaf } from "../ui/icons";

export default function UseItUp() {
  const [expiring, setExpiring] = useState<InventoryRow[]>([]);
  const [hits, setHits] = useState<UseItUpHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const td = today();

  useEffect(() => {
    api
      .useItUp()
      .then((d) => {
        setExpiring(d.expiring);
        setHits(d.recipes);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn’t load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="appbar">
        <h1>Use it up</h1>
        <Link className="mini" to="/recipes">
          Recipes
        </Link>
      </header>
      <div className="screen">
        {error && <p className="alert">{error}</p>}

        {loading ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            {hits.length > 0 && (
              <section className="sec">
                <div className="sec-head">
                  <span className="eyebrow">Cook this</span>
                </div>
                <div className="rgroup">
                  {hits.map((h) => (
                    <article key={h.recipe.id} className="cook">
                      <div className="cook-top">
                        <h3>{h.recipe.name}</h3>
                        <span className="uses">
                          <IconLeaf />
                          uses {h.matchedUrgentCount}
                        </span>
                      </div>
                      <p className="cook-items">{h.matchedItems.map((m) => m.name).join(" · ")}</p>
                      {h.missing.length > 0 && (
                        <p className="cook-missing">Still need: {h.missing.join(", ")}</p>
                      )}
                      {h.recipe.url && (
                        <a
                          className="mini"
                          href={h.recipe.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Open recipe →
                        </a>
                      )}
                      {h.recipe.notes && <p className="cook-missing">{h.recipe.notes}</p>}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="sec">
              <div className="sec-head">
                <span className="eyebrow">Eat these first</span>
                {expiring.length > 0 && <span className="sec-count">{expiring.length}</span>}
              </div>
              {expiring.length === 0 ? (
                <p className="empty">Nothing needs using up. Nicely done.</p>
              ) : (
                <div className="rows">
                  {expiring.map((r) => (
                    <ProductRow key={r.productId} row={r} locName={() => ""} today={td} />
                  ))}
                </div>
              )}
            </section>

            {hits.length === 0 && expiring.length > 0 && (
              <p className="note">
                Save a recipe with these ingredients and it’ll show up here when they’re about to go
                off.{" "}
                <Link className="mini" to="/recipes">
                  Add a recipe
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
