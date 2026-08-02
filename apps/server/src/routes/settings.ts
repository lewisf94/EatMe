import type { FastifyInstance } from "fastify";
import { DietaryRequirement } from "@eatme/shared";
import { z } from "zod";
import { dietaryRequirements, setSetting, timezone } from "../repo/settings.js";
import { isValidTimezone } from "../services/timezone.js";

const SettingsPatch = z.object({
  household_timezone: z
    .string()
    .min(1)
    .max(100)
    .refine(isValidTimezone, "must be a valid IANA timezone")
    .optional(),
  dietary_requirements: z.array(DietaryRequirement).optional(),
});

const current = () => ({
  household_timezone: timezone(),
  dietary_requirements: dietaryRequirements(),
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
    return { data: current() };
  });
}
