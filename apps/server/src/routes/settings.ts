import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { setSetting, timezone } from "../repo/settings.js";

const SettingsPatch = z.object({ household_timezone: z.string().min(1).optional() });

export async function registerSettings(app: FastifyInstance): Promise<void> {
  app.get("/settings", async () => ({ data: { household_timezone: timezone() } }));

  app.put("/settings", async (req, reply) => {
    const parsed = SettingsPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid settings", issues: parsed.error.issues } });
    if (parsed.data.household_timezone)
      setSetting("household_timezone", parsed.data.household_timezone);
    return { data: { household_timezone: timezone() } };
  });
}
