import { db } from "../db.js";

/**
 * Run a mutation at most once per client op-id. A repeat op-id (an offline write
 * being replayed) returns the previously stored result instead of applying again.
 * Statements are lazy so importing this never touches the schema at load time.
 */
export function idempotent<T>(opId: string | undefined, run: () => T): T {
  if (!opId) return run();
  const seen = db.prepare("SELECT result_json FROM op_log WHERE op_id = ?").get(opId) as
    { result_json: string } | undefined;
  if (seen) return JSON.parse(seen.result_json) as T;

  const result = run();
  // Only remember successful mutations, so a 404/undefined isn't cached forever.
  if (result !== undefined && result !== null) {
    db.prepare("INSERT OR IGNORE INTO op_log (op_id, result_json, at) VALUES (?, ?, ?)").run(
      opId,
      JSON.stringify(result),
      new Date().toISOString(),
    );
  }
  return result;
}
