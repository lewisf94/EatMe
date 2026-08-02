import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  saveSubscription,
  deleteSubscriptionByEndpoint,
  countSubscriptions,
} from "../repo/push.js";
import { publicKey, sendToAll, runDueJobs } from "../services/push.js";

// The shape the browser's PushSubscription serialises to.
const PushEndpoint = z
  .string()
  .url()
  .max(4096)
  .refine(
    (value) => URL.canParse(value) && new URL(value).protocol === "https:",
    "endpoint must use HTTPS",
  );
const SubscriptionInput = z.object({
  endpoint: PushEndpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(4096),
    auth: z.string().min(1).max(4096),
  }),
});

export async function registerPush(app: FastifyInstance): Promise<void> {
  app.get("/push/public-key", async () => ({
    data: { publicKey: publicKey(), subscribers: countSubscriptions() },
  }));

  app.post("/push/subscribe", async (req, reply) => {
    const parsed = SubscriptionInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid subscription", issues: parsed.error.issues } });
    const sub = saveSubscription(parsed.data.endpoint, parsed.data.keys);
    return reply.code(201).send({ data: { id: sub.id } });
  });

  app.post("/push/unsubscribe", async (req, reply) => {
    const parsed = z.object({ endpoint: PushEndpoint }).safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { message: "an endpoint is required" } });
    return { data: { removed: deleteSubscriptionByEndpoint(parsed.data.endpoint) } };
  });

  app.post("/push/test", async () => ({
    data: await sendToAll({ title: "EatMe", body: "Notifications are working.", url: "/" }),
  }));

  // Lets the scheduled jobs be exercised now rather than at 09:00 on a Monday.
  app.post("/push/run-jobs", async () => ({ data: { ran: await runDueJobs() } }));
}
