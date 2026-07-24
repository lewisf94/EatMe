import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe } from "@eatme/shared";
import { api } from "../api";
import { IconBack, IconPlus } from "../ui/icons";

/** Ingredients are loose match text ("chickpea" finds "Chickpeas 400g"), edited
 *  as chips because that's how you think about them. */
function Editor({
  recipe,
  onSave,
  onCancel,
  onDelete,
}: {
  recipe: Recipe | null;
  onSave: (input: { name: string; url: string | null; ingredients: string[] }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [url, setUrl] = useState(recipe?.url ?? "");
  const [ingredients, setIngredients] = useState<string[]>(recipe?.ingredients ?? []);
  const [draft, setDraft] = useState("");

  const addChip = () => {
    const v = draft.trim();
    if (v && !ingredients.includes(v)) setIngredients([...ingredients, v]);
    setDraft("");
  };

  return (
    <section className="sec">
      <div className="sec-head">
        <span className="eyebrow">{recipe ? "Edit recipe" : "New recipe"}</span>
      </div>
      <div className="form">
        <div>
          <label className="label" htmlFor="rname">
            Name
          </label>
          <input
            id="rname"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pesto pasta"
          />
        </div>
        <div>
          <label className="label" htmlFor="rurl">
            Link (optional)
          </label>
          <input
            id="rurl"
            className="field"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="label" htmlFor="ring">
            Ingredients
          </label>
          <div className="chips" style={{ marginBottom: 8 }}>
            {ingredients.map((ing) => (
              <button
                key={ing}
                className="chip"
                aria-label={`Remove ${ing}`}
                onClick={() => setIngredients(ingredients.filter((i) => i !== ing))}
              >
                {ing} ✕
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="ring"
              className="field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChip();
                }
              }}
              placeholder="chickpea"
            />
            <button className="btn btn-line" style={{ flex: "none" }} onClick={addChip}>
              Add
            </button>
          </div>
          <p className="note left tiny" style={{ marginTop: 6 }}>
            Loose words work best — “chickpea” matches “Chickpeas 400g”.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), url: url.trim() || null, ingredients })}
          >
            Save
          </button>
          <button className="btn btn-line" onClick={onCancel}>
            Cancel
          </button>
          {onDelete && (
            <button className="remove" style={{ marginLeft: "auto" }} onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Recipes() {
  const nav = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [editing, setEditing] = useState<Recipe | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    api
      .recipes()
      .then(setRecipes, (e) => setError(e instanceof Error ? e.message : "Couldn’t load"));
  useEffect(() => {
    void reload();
  }, []);

  const guard = (p: Promise<unknown>) =>
    p.then(
      () => {
        setEditing(null);
        void reload();
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn’t save"),
    );

  return (
    <>
      <header className="appbar">
        <div className="bar-left">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <h1>Recipes</h1>
        </div>
        {editing === null && (
          <button className="iconbtn" onClick={() => setEditing("new")} aria-label="New recipe">
            <IconPlus />
          </button>
        )}
      </header>
      <div className="screen">
        {error && <p className="alert">{error}</p>}

        {editing === "new" && (
          <Editor
            recipe={null}
            onSave={(input) => guard(api.createRecipe(input))}
            onCancel={() => setEditing(null)}
          />
        )}
        {editing && editing !== "new" && (
          <Editor
            recipe={editing}
            onSave={(input) => guard(api.patchRecipe(editing.id, input))}
            onCancel={() => setEditing(null)}
            onDelete={() => guard(api.deleteRecipe(editing.id))}
          />
        )}

        {editing === null &&
          (recipes.length === 0 ? (
            <div className="empty">
              <p>No recipes yet.</p>
              <p className="note tiny">
                Add a few and EatMe will suggest the one that rescues the most food.
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setEditing("new")}
              >
                Add a recipe
              </button>
            </div>
          ) : (
            <div className="rgroup">
              {recipes.map((r) => (
                <button key={r.id} className="srow recipe-row" onClick={() => setEditing(r)}>
                  <span className="grow">
                    <b>{r.name}</b>
                    <span className="srow-sub" style={{ display: "block" }}>
                      {r.ingredients.join(" · ") || "no ingredients yet"}
                    </span>
                  </span>
                  <span className="mini">Edit</span>
                </button>
              ))}
            </div>
          ))}
      </div>
    </>
  );
}
