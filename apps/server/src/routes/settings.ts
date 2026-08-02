import type { FastifyInstance } from "fastify";
import { DietaryRequirement } from "@eatme/shared";
import { z } from "zod";
import { dietaryRequirements, getSetting, setSetting, timezone } from "../repo/settings.js";
import { isValidTimezone } from "../services/timezone.js";

const SettingsPatch = z.object({
  household_timezone: z
    .string()
    .min(1)
    .max(100)
    .refine(isValidTimezone, "must be a valid IANA timezone")
    .optional(),
  dietary_requirements: z.array(DietaryRequirement).optional(),
  magtag_stale_hours: z.number().int().min(1).max(336).optional(),
  magtag_low_battery: z.number().int().min(1).max(99).optional(),
  ha_shopping_sync: z.boolean().optional(),
});

const current = () => ({
  household_timezone: timezone(),
  dietary_requirements: dietaryRequirements(),
  magtag_stale_hours: Number(getSetting("magtag_stale_hours", "30")),
  magtag_low_battery: Number(getSetting("magtag_low_battery", "20")),
  ha_shopping_sync: getSetting("ha_shopping_sync", "false") === "true",
});

export async function registerSettings(app: FastifyInstance): Promise<void> {
  app.get("/settings", async () => ({ data: current() }));

  app.put("/settings", async (req, reply) => {
    const parsed = SettingsPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid settings", issues: parsed.error.issues } });
    if (parsed.data.household_timezone)
      setSetting("household_timezone", parsed.data.household_timezone);
    if (parsed.data.dietary_requirements)
      setSetting("dietary_requirements", JSON.stringify(parsed.data.dietary_requirements));
    if (parsed.data.magtag_stale_hours !== undefined)
      setSetting("magtag_stale_hours", String(parsed.data.magtag_stale_hours));
    if (parsed.data.magtag_low_battery !== undefined)
      setSetting("magtag_low_battery", String(parsed.data.magtag_low_battery));
    if (parsed.data.ha_shopping_sync !== undefined)
      setSetting("ha_shopping_sync", String(parsed.data.ha_shopping_sync));
    return { data: current() };
  });
}
