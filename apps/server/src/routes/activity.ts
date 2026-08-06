import type { FastifyInstance } from "fastify";
import { listActivity, usageInsights } from "../repo/activity.js";

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export async function registerActivity(app: FastifyInstance): Promise<void> {
  app.get("/activity", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return { data: listActivity(boundedInt(q.limit, 50, 1, 200)) };
  });

  app.get("/insights", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return { data: usageInsights(boundedInt(q.days, 90, 7, 3650)) };
  });
}
