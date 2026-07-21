export const config = {
  port: Number(process.env.PORT ?? 8099),
  dataDir: process.env.DATA_DIR ?? "./data",
  offUserAgent: process.env.OFF_USER_AGENT ?? "EatMe/0.1 (github.com/lewisf94/EatMe)",
  /** When set, /api/* requires `Authorization: Bearer <token>` (wired up in P4). */
  authToken: process.env.AUTH_TOKEN ?? "",
};
