/** Hide device credentials from request logs while retaining the route and
 * non-secret query parameters needed for diagnostics. */
export function redactRequestUrl(value: unknown): string {
  if (typeof value !== "string") return "[REDACTED]";
  return value.replace(/([?&]token=)[^&#]*/gi, "$1[REDACTED]");
}
