import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { byUrgency, civilToday } from "@eatme/shared";
import { z } from "zod";
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
import { secretMatches } from "../services/security.js";
import { urgencyPhrase, formatRendered } from "../services/display.js";
import {
  buildMagtagUrgentSvg,
  buildMagtagRecipeSvg,
  buildMagtagShoppingSvg,
  buildMagtagStatusSvg,
  renderMagtagBmp,
  MAGTAG_ROWS,
  type MagtagUrgentData,
  type MagtagRecipeData,
  type MagtagShoppingData,
  type MagtagStatusData,
} from "../services/magtagDisplay.js";

// Buttons A-D and pages are the same four things, one to one — there is no
// separate "refresh" button. Instead, the firmware skips its ETag cache on
// every button-triggered wake (never on a scheduled one), so any button
// press redraws its page even when the content happens to be unchanged.
const PAGES = ["urgent", "recipe", "shopping", "status"] as const;
type Page = (typeof PAGES)[number];
const isPage = (v: string): v is Page => (PAGES as readonly string[]).includes(v);
const MagtagStatus = z.object({
  battery: z.number().min(0).max(100).nullable().optional(),
  wakeReason: z.string().max(100).nullable().optional(),
  firmware: z.string().max(100).nullable().optional(),
  rssi: z.number().min(-200).max(0).nullable().optional(),
  displayUpdated: z.boolean().nullable().optional(),
  wakeSeconds: z.number().min(0).max(300).nullable().optional(),
});
const MagtagButton = z.object({ button: z.enum(PAGES) });

function jsonSetting<T>(key: string): T | null {
  try {
    const value = getSetting(key, "");
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function gatherUrgent(now = new Date()): MagtagUrgentData {
  const tz = timezone();
  const rows = listInventory({}, civilToday(tz, now)).sort(byUrgency);
  const urgent = rows.filter((r) => r.status !== "ok");
  return {
    urgent: urgent.slice(0, MAGTAG_ROWS).map((r) => ({ name: r.name, sub: urgencyPhrase(r) })),
    urgentTotal: urgent.length,
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
    rendered: formatRendered(tz, now),
  };
}

function gatherShopping(now = new Date()): MagtagShoppingData {
  const items = listShopping(false);
  return {
    items: items.map((i) => i.name),
    total: items.length,
    rendered: formatRendered(timezone(), now),
  };
}

function gatherStatus(now = new Date()): MagtagStatusData {
  const tz = timezone();
  const status = jsonSetting<{
    battery: number | null;
    rssi: number | null;
    reportedAt: string;
  }>("magtag_status");
  return {
    battery: status?.battery ?? null,
    rssi: status?.rssi ?? null,
    lastSync: status ? formatRendered(tz, new Date(status.reportedAt)) : null,
    rendered: formatRendered(tz, now),
  };
}

type PageData = MagtagUrgentData | MagtagRecipeData | MagtagShoppingData | MagtagStatusData;
type CachedPage = { semantic: string; payload: Buffer; etag: string };
const pageCache = new Map<Page, CachedPage>();

function gatherPage(page: Page): PageData {
  if (page === "recipe") return gatherRecipe();
  if (page === "shopping") return gatherShopping();
  if (page === "status") return gatherStatus();
  return gatherUrgent();
}

function semanticPage(page: Page, data: PageData): string {
  // The footer time must not force an e-paper refresh by itself; only real
  // content changes justify a redraw. Battery isn't drawn on the panel at all
  // (see services/magtagDisplay.ts), so it can't go stale here — it is still
  // recorded for device health on every wake, including a 304 response.
  const { rendered: _rendered, ...content } = data;
  return JSON.stringify({ page, content });
}

function renderPage(page: Page): CachedPage {
  const data = gatherPage(page);
  const semantic = semanticPage(page, data);
  const cached = pageCache.get(page);
  if (cached?.semantic === semantic) return cached;

  const payload =
    page === "recipe"
      ? renderMagtagBmp(buildMagtagRecipeSvg(data as MagtagRecipeData))
      : page === "shopping"
        ? renderMagtagBmp(buildMagtagShoppingSvg(data as MagtagShoppingData))
        : page === "status"
          ? renderMagtagBmp(buildMagtagStatusSvg(data as MagtagStatusData))
          : renderMagtagBmp(buildMagtagUrgentSvg(data as MagtagUrgentData));
  const next = {
    semantic,
    payload,
    etag: `"${createHash("sha256").update(payload).digest("hex").slice(0, 16)}"`,
  };
  pageCache.set(page, next);
  return next;
}

function etagMatches(raw: string | undefined, etag: string): boolean {
  if (!raw) return false;
  return raw
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag || value === `W/${etag}`);
}

function sendPage(page: Page, req: FastifyRequest, reply: FastifyReply) {
  const rendered = renderPage(page);
  // no-cache, not no-store: the device is *expected* to keep the last validator
  // and revalidate on the next wake, which is what makes the 304 path (and the
  // skipped e-paper refresh) possible. no-store would forbid retaining it.
  reply.header("ETag", rendered.etag).header("Cache-Control", "no-cache");
  const candidate = req.headers["if-none-match"];
  const ifNoneMatch = Array.isArray(candidate) ? candidate.join(",") : candidate;
  if (etagMatches(ifNoneMatch, rendered.etag)) return reply.code(304).send();
  return reply.type("image/bmp").send(rendered.payload);
}

export async function registerMagtag(app: FastifyInstance): Promise<void> {
  // The MagTag carries its own device token, never the household's admin
  // token — set MAGTAG_TOKEN to require it (app.ts exempts this prefix from
  // the bearer gate in that case, same pattern as the classic display).
  function unauthorized(q: Record<string, string | undefined>): boolean {
    return Boolean(config.magtagToken) && !secretMatches(q.token, config.magtagToken);
  }

  // Household/admin view. This route is intentionally outside the device-token
  // checks and is protected by the normal API bearer gate when configured.
  app.get("/magtag/health", async () => {
    const status = jsonSetting<{
      battery: number | null;
      wakeReason: string | null;
      firmware: string | null;
      rssi: number | null;
      displayUpdated: boolean | null;
      wakeSeconds: number | null;
      reportedAt: string;
    }>("magtag_status");
    const lastButton = jsonSetting<{ button: string; at: string }>("magtag_last_button");
    const staleHours = Number(getSetting("magtag_stale_hours", "30"));
    const lowBattery = Number(getSetting("magtag_low_battery", "20"));
    const ageMs = status ? Date.now() - Date.parse(status.reportedAt) : Infinity;
    return {
      data: {
        configured: Boolean(config.magtagToken),
        status,
        lastButton,
        staleHours,
        lowBattery,
        isStale: ageMs > staleHours * 3_600_000,
        isLowBattery: status?.battery != null && status.battery <= lowBattery,
      },
    };
  });

  // Button 1 / the default wake screen: the same urgency list as the classic
  // panel, one image request per wake. BMP, not PNG: CircuitPython decodes the
  // compact indexed response in RAM without writing its flash filesystem.
  app.get("/magtag/display.bmp", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    recordDisplayBattery(q.battery);
    return sendPage("urgent", req, reply);
  });

  // Buttons 2-4: recipe suggestion, shopping summary, or device status —
  // fetched only when the matching button is pressed.
  app.get("/magtag/page/:page", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    const { page } = req.params as { page: string };
    if (!isPage(page)) return reply.code(404).send({ error: { message: "unknown page" } });
    recordDisplayBattery(q.battery);
    return sendPage(page, req, reply);
  });

  // Read-only device status (battery, wake reason, firmware, Wi-Fi signal).
  // Kept separate from the image fetch so a status-only wake needn't render.
  app.post("/magtag/status", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (unauthorized(q)) return reply.code(401).send({ error: { message: "unauthorized" } });
    const parsed = MagtagStatus.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply.code(400).send({ error: { message: "invalid status report" } });
    const body = parsed.data;
    if (typeof body.battery === "number") recordDisplayBattery(String(body.battery));
    setSetting(
      "magtag_status",
      JSON.stringify({
        battery: typeof body.battery === "number" ? body.battery : null,
        wakeReason: typeof body.wakeReason === "string" ? body.wakeReason : null,
        firmware: typeof body.firmware === "string" ? body.firmware : null,
        rssi: typeof body.rssi === "number" ? body.rssi : null,
        displayUpdated: typeof body.displayUpdated === "boolean" ? body.displayUpdated : null,
        wakeSeconds: typeof body.wakeSeconds === "number" ? body.wakeSeconds : null,
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
    const parsed = MagtagButton.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: { message: "unknown button" } });
    const { button } = parsed.data;
    setSetting("magtag_last_button", JSON.stringify({ button, at: new Date().toISOString() }));
    return { data: { ok: true } };
  });
}
