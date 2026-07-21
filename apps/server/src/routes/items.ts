import type { FastifyInstance } from "fastify";
import {
  ItemInput,
  ItemPatch,
  EventInput,
  ArchiveInput,
  computeStatus,
  civilToday,
  type Status,
} from "@whattoeat/shared";
import * as items from "../repo/items.js";
import { categoriesMap } from "../repo/categories.js";
import { timezone } from "../repo/settings.js";

export async function registerItems(app: FastifyInstance): Promise<void> {
  app.get("/items", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const list = items.listItems({
      q: q.q,
      locationId: q.location,
      includeArchived: q.includeArchived === "1" || q.includeArchived === "true",
    });

    const cats = categoriesMap();
    const today = civilToday(timezone());
    let withStatus = list.map((it) => {
      const cat = cats.get(it.categoryId);
      const s = cat
        ? computeStatus(it, cat, today)
        : { status: "ok" as Status, pressureDate: null, daysLeft: null };
      return { ...it, ...s };
    });

    if (q.status) withStatus = withStatus.filter((i) => i.status === q.status);

    const sort = q.sort ?? "urgency";
    withStatus.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
      // urgency: fewest days left first, undated items last
      return (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);
    });

    return { data: withStatus };
  });

  app.post("/items", async (req, reply) => {
    const parsed = ItemInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid item", issues: parsed.error.issues } });
    return { data: items.createItem(parsed.data) };
  });

  app.get("/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const it = items.getItem(id);
    if (!it) return reply.code(404).send({ error: { message: "not found" } });
    return { data: it };
  });

  app.patch("/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ItemPatch.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid patch", issues: parsed.error.issues } });
    const it = items.updateItem(id, parsed.data);
    if (!it) return reply.code(404).send({ error: { message: "not found" } });
    return { data: it };
  });

  app.post("/items/:id/archive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ArchiveInput.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid archive reason", issues: parsed.error.issues } });
    const it = items.archiveItem(id, parsed.data.reason);
    if (!it) return reply.code(404).send({ error: { message: "not found" } });
    return { data: it };
  });

  app.post("/items/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = EventInput.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { message: "invalid event", issues: parsed.error.issues } });
    const it = items.addEvent(id, parsed.data.event, parsed.data.fractionAfter ?? null);
    if (!it) return reply.code(404).send({ error: { message: "not found" } });
    return { data: it };
  });
}
