# OFF · Offline inventory (answer "do I already have this?" without signal)

**Why:** P3 only cached the app *shell*; every API call is network-first. So in a
supermarket — poor signal, Tailscale hiccup, or the Pi rebooting — the app opens
but can't answer its single most important question: *do I already have cumin?*

**Prerequisites:** [DM](11-phase-data-model.md) (stable ids the snapshot keys on).

## Model

Keep an **IndexedDB** snapshot the app reads instantly, refresh in the background,
and queue writes made while offline.

Store in IndexedDB: latest inventory snapshot (aggregated products + active lots),
products + aliases, locations, categories, `lastSyncedAt`, and a **pending-ops
queue**.

Behaviour:
1. On open, render the cached snapshot **immediately** (no spinner if we have data).
2. Refresh from the server in the background; show `Last synced 18:42`.
3. Queue quantity changes / adds while offline; **mark pending items visibly**.
4. **Replay the queue explicitly** when the app resumes or regains connectivity —
   do **not** rely on the Background Sync API (uneven on iOS).
5. Every mutation carries a **client-generated op-id** so replays can't create
   duplicates; the server dedupes on op-id (idempotent writes).

Conflicts are trivial here (one household) → last-write-wins is fine.

## Server

- Accept an `opId` on mutations; store applied op-ids; a repeat op-id is a no-op
  returning the prior result.
- `GET /api/inventory?since=` for cheap incremental refresh (optional; a full
  snapshot is fine at this size).

## Acceptance checklist

- [ ] Load online once, go offline, reopen → inventory is visible **and
      searchable** ("do I have X?").
- [ ] Make a fraction change offline → shown as pending → replays on reconnect,
      **exactly once** (op-id idempotency test: replay twice, one effect).
- [ ] `Last synced` reflects the real last successful refresh.
- [ ] Committed Playwright test drives offline → change → reconnect → single apply.

## Definition of done

The app is genuinely useful offline, and offline edits sync back safely. Commit
`OFF: offline inventory snapshot + queued mutations`. **Stop.**
