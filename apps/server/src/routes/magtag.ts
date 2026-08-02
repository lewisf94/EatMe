import type { FastifyInstance } from "fastify";
import { byUrgency, civilToday } from "@eatme/shared";
import { config } from "../config.js";
import { listInventory } from "../repo/inventory.js";
import { listRecipes } from "../repo/recipes.js";
import { listShopping } from "../repo/shopping.js";
import { rankUseItUp } from "../services/recipes.js";
import {
  dietaryRequirements,
  getSetting,
  recordDisplayBattery,
  setSetting,
  timezone,
} from "../repo/settings.js";
import { recipeMeetsRequirements } from "../data/starterRecipes.js";
import { urgencyPhrase, formatRendered } from "../services/display.js";
import {
  buildMagtagUrgentSvg,
  buildMagtagRecipeSvg,
  buildMagtagShoppingSvg,
  renderMagtagBmp,
  MAGTAG_ROWS,
  type MagtagUrgentData,
  type MagtagRecipeData,
  type MagtagShoppingData,
} from "../services/magtagDisplay.js";

const PAGES = ["urgent", "recipe", "shopping"] as const;
type Page = (typeof PAGES)[number];
const isPage = (v: string): v is Page => (PAGES as readonly string[]).includes(v);

function currentBattery(): number | undefined {
  const stored = getSetting("display_battery", "");
  return stored === "" ? undefined : Number(stored);
}

function gatherUrgent(now = new Date()): MagtagUrgentData {
  const tz = timezone();
  const rows = listInventory({}, civilToday(tz, now)).sort(byUrgency);
  return {
    urgent: rows
      .filter((r) => r.status !== "ok")
      .slice(0, MAGTAG_ROWS)
      .map((r) => ({ name: r.name, sub: urgencyPhrase(r) })),
    battery: currentBattery(),
    rendered: formatRendered(tz, now),
  };
}

function gatherRecipe(now = new Date()): MagtagRecipeData {
  const tz = timezone();
  const rows = listInventory({}, civilToday(tz, now)).sort(byUrgency);
  const top = rankUseItUp(
    listRecipes().filter((recipe) =>
      recipeMeetsRequirements(recipe.dietaryTags, dietaryRequirements()),
    ),
    rows,
  )[0];
  return {
    recipe: top?.recipe.name,
    matchedItems: top?.matchedItems.map((m) => m.name) ?? [],
    battery: currentBattery(),
    rendered: formatRendered(tz, now),
  };
}

function gatherShopping(now = new Date()): MagtagShoppingData {
  const items = listShopping(false);
  return {
    items: items.map((i) => i.name),
    total: items.length,
    battery: currentBattery(),
    rendered: formatRendered(timezone(), now),
  };
}

function renderPage(page: Page): Buffer {
  if (page === "recipe") return renderMagtagBmp(buildMagtagRecipeSvg(gatherRecipe()));
  if (page === "shopping") return renderMagtagBmp(buildMagtagShoppingSvg(gatherShopping()));
  return renderMagtagBmp(buildMagtagUrgentSvg(gatherUrgent()));
}

export async function registerMagtag(app: FastifyInstance): Promise<void> {
  // The MagTag carries its own device token, never the household's admin
  // token — set MAGTAG_TOKEN to require it (app.ts exempts this prefix from
  // the bearer gate in that case, same pattern as the classic display).
  function unauthorized(q: Record<string, string | undefined>): boolean {
    return Boolean(config.magtagToken) && q.token !== config.magtagToken;
  }

  // Button 1 / the default wake screen: the same urgency list as the classic
  // panel, one image request per wake. BMP, not PNG: CircuitPython's
  // displayio.OnDiskBitmap (what the MagTag firmware uses to stream the image
  // straight to the panel) only reads BMP.
  app.get("/magtag/display.bmp", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    recordDisplayBattery(q.battery);
    return reply.type("image/bmp").header("Cache-Control", "no-store").send(renderPage("urgent"));
  });

  // Buttons 2-3: the recipe suggestion or shopping summary, fetched only when
  // the matching button is pressed.
  app.get("/magtag/page/:page", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    const { page } = req.params as { page: string };
    if (!isPage(page)) return reply.code(404).send({ error: { message: "unknown page" } });
    recordDisplayBattery(q.battery);
    return reply.type("image/bmp").header("Cache-Control", "no-store").send(renderPage(page));
  });

  // Read-only device status (battery, wake reason, firmware, Wi-Fi signal).
  // Kept separate from the image fetch so a status-only wake needn't render.
  app.post("/magtag/status", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.battery === "number") recordDisplayBattery(String(body.battery));
    setSetting(
      "magtag_status",
      JSON.stringify({
        battery: typeof body.battery === "number" ? body.battery : null,
        wakeReason: typeof body.wakeReason === "string" ? body.wakeReason : null,
        firmware: typeof body.firmware === "string" ? body.firmware : null,
        rssi: typeof body.rssi === "number" ? body.rssi : null,
        reportedAt: new Date().toISOString(),
      }),
    );
    return { data: { ok: true } };
  });

  // Optional button telemetry: which button was pressed, for future use (the
  // first version stays read-only — this doesn't change what any button does).
  app.post("/magtag/button", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const button = typeof body.button === "string" ? body.button : "";
    if (!isPage(button) && button !== "refresh")
      return reply.code(400).send({ error: { message: "unknown button" } });
    setSetting("magtag_last_button", JSON.stringify({ button, at: new Date().toISOString() }));
    return { data: { ok: true } };
  });
}
