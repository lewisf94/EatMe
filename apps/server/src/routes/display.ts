import type { FastifyInstance } from "fastify";
import { byUrgency, civilToday } from "@eatme/shared";
import { config } from "../config.js";
import { listInventory } from "../repo/inventory.js";
import { listRecipes } from "../repo/recipes.js";
import { rankUseItUp } from "../services/recipes.js";
import { dietaryRequirements, getSetting, setSetting, timezone } from "../repo/settings.js";
import { recipeMeetsRequirements } from "../data/starterRecipes.js";
import {
  buildDashboardSvg,
  renderPng,
  urgencyPhrase,
  DISPLAY_ROWS,
  type DashboardData,
} from "../services/display.js";

/** What the panel shows: the most urgent items, plus a footer line. */
function gatherDashboardData(now = new Date()): DashboardData {
  const tz = timezone();
  const rows = listInventory({}, civilToday(tz, now)).sort(byUrgency);
  const stored = getSetting("display_battery", "");

  return {
    // Only things that actually want attention; "ok" items are noise on a panel.
    urgent: rows
      .filter((r) => r.status !== "ok")
      .slice(0, DISPLAY_ROWS)
      .map((r) => ({ name: r.name, sub: urgencyPhrase(r) })),
    // The best thing to cook with what's going off, if any recipe fits.
    recipe: rankUseItUp(
      listRecipes().filter((recipe) =>
        recipeMeetsRequirements(recipe.dietaryTags, dietaryRequirements()),
      ),
      rows,
    )[0]?.recipe.name,
    lowStock: rows.filter((r) => r.fractionLeft != null && r.fractionLeft <= 0.25).length,
    battery: stored === "" ? undefined : Number(stored),
    rendered: new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(now),
  };
}

export async function registerDisplay(app: FastifyInstance): Promise<void> {
  // The e-ink panel fetches this on each wake. It can't send an Authorization
  // header, so when DISPLAY_TOKEN is set it authenticates with ?token= instead
  // (app.ts exempts this route from the bearer gate in that case).
  app.get("/display.png", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (config.displayToken && q.token !== config.displayToken)
      return reply.code(401).send({ error: { message: "unauthorized" } });

    // The device reports its LiPo level on the same call that fetches the image.
    const battery = Number(q.battery);
    if (q.battery != null && q.battery !== "" && Number.isFinite(battery))
      setSetting("display_battery", String(Math.max(0, Math.min(100, Math.round(battery)))));

    const png = renderPng(buildDashboardSvg(gatherDashboardData()));
    return reply.type("image/png").header("Cache-Control", "no-store").send(png);
  });
}
