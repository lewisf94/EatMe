import { db } from "../db.js";

/**
 * Run `fn` inside a single IMMEDIATE transaction, keyed by an optional client
 * op-id. The op-id check, the mutation(s), and recording the op all commit
 * together — so a crash can never leave a half-applied op that a replay would
 * apply again, and a repeated op-id returns the stored result without re-running.
 * With no op-id, `fn` still runs atomically (its several writes commit as one).
 *
 * Statements are lazy so importing this never touches the schema at load time.
 */
export function idempotent<T>(opId: string | undefined, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (opId) {
      const seen = db.prepare("SELECT result_json FROM op_log WHERE op_id = ?").get(opId) as
        { result_json: string } | undefined;
      if (seen) {
        db.exec("COMMIT");
        return JSON.parse(seen.result_json) as T;
      }
    }

    const result = fn();

    // Only remember successful mutations, so a 404/undefined isn't cached forever.
    if (opId && result !== undefined && result !== null) {
      db.prepare("INSERT OR IGNORE INTO op_log (op_id, result_json, at) VALUES (?, ?, ?)").run(
        opId,
        JSON.stringify(result),
        new Date().toISOString(),
      );
    }
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
