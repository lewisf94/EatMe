import type { FastifyInstance } from "fastify";
import { byUrgency, civilToday } from "@eatme/shared";
import { listInventory } from "../repo/inventory.js";
import { timezone } from "../repo/settings.js";
import { createBackup, databaseIntegrity, restoreBackup } from "../services/backup.js";

const csv = (value: unknown): string => {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export async function registerMaintenance(app: FastifyInstance): Promise<void> {
  app.get("/maintenance/integrity", async () => ({ data: databaseIntegrity() }));

  app.get("/maintenance/backup", async (_req, reply) => {
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .type("application/json")
      .header("Content-Disposition", `attachment; filename="eatme-backup-${date}.json"`)
      .send(createBackup());
  });

  app.get("/maintenance/inventory.csv", async (_req, reply) => {
    const rows = listInventory({}, civilToday(timezone())).sort(byUrgency);
    const header = [
      "Product",
      "Brand",
      "Packs",
      "Fraction left",
      "Status",
      "Pressure date",
      "Date kind",
    ];
    const body = [
      header.map(csv).join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.brand,
          row.totalCount,
          row.fractionLeft,
          row.status,
          row.pressureDate,
          row.pressureKind,
        ]
          .map(csv)
          .join(","),
      ),
    ].join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="eatme-inventory-${date}.csv"`)
      .send(body);
  });

  app.post("/maintenance/restore", { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    try {
      return { data: restoreBackup(req.body) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid backup";
      return reply.code(400).send({ error: { message } });
    }
  });
}
