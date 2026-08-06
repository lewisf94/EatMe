import type { FastifyInstance } from "fastify";
import { byUrgency, civilToday } from "@eatme/shared";
import { listInventory } from "../repo/inventory.js";
import { timezone } from "../repo/settings.js";
import { getSetting } from "../repo/settings.js";
import {
  automaticBackupStatus,
  createAutomaticBackup,
  createBackup,
  databaseIntegrity,
  latestAutomaticBackup,
  restoreBackup,
} from "../services/backup.js";

const csv = (value: unknown): string => {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export async function registerMaintenance(app: FastifyInstance): Promise<void> {
  app.get("/maintenance/integrity", async () => ({ data: databaseIntegrity() }));

  app.get("/maintenance/automatic-backups", async () => ({
    data: automaticBackupStatus(Number(getSetting("backup_retention", "7"))),
  }));

  app.post("/maintenance/automatic-backups", async () => ({
    data: createAutomaticBackup(Number(getSetting("backup_retention", "7"))),
  }));

  app.get("/maintenance/automatic-backups/latest", async (_req, reply) => {
    const latest = latestAutomaticBackup();
    if (!latest) return reply.code(404).send({ error: { message: "no recovery snapshot yet" } });
    return reply
      .type("application/json")
      .header("Content-Disposition", `attachment; filename="${latest.filename}"`)
      .send(latest.payload);
  });

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
