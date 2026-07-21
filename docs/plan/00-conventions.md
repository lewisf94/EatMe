# 00 · Conventions (read once, obey everywhere)

These decisions are **fixed**. Do not substitute libraries, restructure folders, or "modernise" them. They were chosen for a reason recorded in [research-notes.md](research-notes.md).

## Runtime & tooling

| Thing | Choice | Why |
|---|---|---|
| Language | TypeScript, `"strict": true` | — |
| TS version | `typescript@^5.9.0` | Boring and universally supported. TS 7 (native compiler) exists but stay on 5.x for tooling compatibility. |
| Node | **Node 24** (`engines.node >= 24`) | `node:sqlite` is a stable built-in here — **no native SQLite module to compile for the Pi's arm64/musl**. |
| Package manager | **pnpm 10**, workspaces | Monorepo. |
| Server framework | **Fastify 5** | — |
| Database | **`node:sqlite`** (`DatabaseSync`), hand-written SQL, numbered `.sql` migrations | Zero native deps. No ORM — the schema is ~10 tables; an ORM adds more surface than it saves. **Ignore any mention of better-sqlite3 / Drizzle in `docs/0X`.** |
| Validation | **zod 4** in `@eatme/shared` | One schema, server validates + web infers types. |
| SVG→PNG (display) | **`@resvg/resvg-js`** | Clean prebuilt `linux-arm64-musl` binary. **Not `sharp`** (its SVG path had musl-arm64 gaps). |
| Web build | **Vite (current major) + React 19 + Tailwind v4 (`@tailwindcss/vite`) + `vite-plugin-pwa`** | Install these together at their current `latest` so their peer ranges agree — do **not** pin an older Vite. |
| Barcode scan | **`barcode-detector`** ponyfill (zxing-wasm) | iOS Safari has no native `BarcodeDetector`. **Self-host the `.wasm`** (see P3). |
| Router | `react-router-dom` v7 | Needed for `/i/:qrUid` deep links. |
| Tests | **vitest** | — |
| Formatting | **prettier** (defaults) | `pnpm check` enforces. No ESLint — keep friction low. |

Confirm current versions against [research-notes.md](research-notes.md); if a pinned major is gone, follow rule 5 in [README](README.md#protocol-for-the-implementing-agent) (stop + report), don't silently swap.

## Repo layout (final target — phases fill it in)

```
eatme/
├── package.json                 # root: scripts + devDeps (prettier, typescript)
├── pnpm-workspace.yaml          # packages: [apps/*, packages/*]
├── tsconfig.base.json           # shared compiler options
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts         # boot: migrate() then listen
│   │   │   ├── app.ts           # buildApp(): Fastify instance + route registration
│   │   │   ├── config.ts        # env → typed config object
│   │   │   ├── db.ts            # DatabaseSync singleton + migrate()
│   │   │   ├── repo/            # one file per table, prepared statements
│   │   │   ├── routes/          # one file per resource
│   │   │   └── services/        # off.ts (Open Food Facts), display.ts, push.ts …
│   │   └── migrations/          # 001_init.sql, 002_*.sql …
│   └── web/
│       └── src/                 # React PWA
├── packages/
│   └── shared/
│       └── src/index.ts         # zod schemas, types, computeStatus()
├── addon/                       # HA add-on packaging (P4)
├── firmware/                    # ESPHome YAML (P6)
└── docs/
```

## Naming & data conventions

- **Package names**: `@eatme/shared`, `@eatme/server`, `@eatme/web`.
- **IDs**: primary keys are text; generate with the `newId()` helper in `@eatme/shared` (12-char base58 from `crypto.getRandomValues`). `qrUid` uses the same helper but 8 chars.
- **Dates**: calendar dates (`bestBefore`, `openedAt`) stored as `YYYY-MM-DD` strings. Timestamps (`createdAt`) stored as ISO-8601 UTC strings. Never store JS `Date` objects or epoch numbers.
- **Money/quantities**: `fractionLeft` is a real in `[0,1]`. Nothing else is a float.
- **API shape**: all responses `{ data: … }` or `{ error: { message } }`. All bodies validated with a zod schema from `@eatme/shared` before touching the DB.
- **Server port**: `8099` (override with `PORT`). **Data dir**: `DATA_DIR` env, default `./data` locally, `/data` in the add-on. The SQLite file is `${DATA_DIR}/eatme.db`.

## Config (env vars — the only config surface)

| Var | Default | Used from |
|---|---|---|
| `PORT` | `8099` | P1 |
| `DATA_DIR` | `./data` | P1 |
| `OFF_USER_AGENT` | `EatMe/0.x (github.com/lewisf94/EatMe)` | P1 (Open Food Facts requires a custom UA) |
| `AUTH_TOKEN` | *(empty = auth off)* | P4 |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | *(generated on first boot, persisted to `DATA_DIR`)* | P8 |
| `ANTHROPIC_API_KEY` | *(empty = LLM off)* | P9 |

## Definition of "green"

`pnpm check` at the repo root must pass before **every** commit. It runs, across all workspace packages: `tsc --noEmit`, `prettier --check`, and `vitest run`. A phase is not done until its acceptance checklist passes and `pnpm check` is green.
