# P5 · QR labels for decanted jars

**Goal:** solve the problem the project exists for — spice jars refilled from bags have no barcode. Generate a QR label per item; scanning a jar's lid jumps straight to its quick-update screen.

**Prerequisites:** P1–P3 green (P4 optional but the deep links are nicer over the real HTTPS URL).

## How it works

- Every item already has a `qrUid` (created in P1). The QR encodes `https://<server>/i/<qrUid>`.
- The server route `GET /i/:qrUid` looks up the item and **302-redirects to the SPA** at `/item/:id` (the client route from P2). Scanning with the plain iOS Camera app therefore opens the app straight on that jar's fraction buttons.
- A **print sheet** renders many QR codes on one page for a sticker session.

## Deliverables

1. `GET /i/:qrUid` redirect route (server).
2. `GET /api/labels?ids=a,b,c` (or `?all=1`) → an HTML page of QR codes + item names, sized for A4, print-optimised.
3. Web: a **"Labels"** action — select items (or "all un-labelled") → open the print sheet → browser print.
4. QR generation with `qrcode` (npm).

## Server: redirect + label sheet

```ts
// routes/labels.ts
import QRCode from "qrcode";
app.get("/i/:qrUid", async (req, reply) => {
  const item = getByQrUid(req.params.qrUid);
  if (!item) return reply.code(404).type("text/html").send("<p>Unknown label</p>");
  return reply.redirect(`/item/${item.id}`, 302);
});

app.get("/api/labels", async (req, reply) => {
  const items = /* selected or all active */;
  const base = publicBaseUrl(req);           // scheme+host from request (works on tailnet URL)
  const cards = await Promise.all(items.map(async (it) => {
    const svg = await QRCode.toString(`${base}/i/${it.qrUid}`, { type: "svg", margin: 0 });
    return `<div class="label">${svg}<span>${escapeHtml(it.name)}</span></div>`;
  }));
  reply.type("text/html").send(labelPage(cards.join("")));   // A4 grid, @media print CSS
});
```
- Use **SVG QR** (crisp at any print size). Label grid: CSS grid, ~19 mm cells, `@media print { @page { margin: 8mm } }`, page-break-safe.
- `publicBaseUrl` must honour `X-Forwarded-Proto/Host` so the encoded URL is the HTTPS tailnet one when behind Tailscale serve (set Fastify `trustProxy`).

## Web

- On **Item detail**: a "Print label" affordance (single-item sheet).
- A **Labels screen** (`/labels`): checklist of active items with a "select all without a printed label" convenience, then "Print selected" → opens `/api/labels?ids=…` in a new tab and calls `window.print()` (or just let the user Cmd/Ctrl-P).
- Optional nicety (note, don't build unless trivial): a per-item `labelPrintedAt` flag so "un-labelled" filtering works — if you add it, that's a tiny migration `002_label_printed.sql`.

## Optional: label printer

Document (in `docs/03-hardware.md`, already noted) that a Niimbot D110 can print these from its own app by rendering each QR as an image. No code needed unless Lewis asks.

## Acceptance checklist

- [ ] `pnpm check` green.
- [ ] `GET /i/<qrUid>` 302s to `/item/<id>`; hitting it in a browser lands on the item screen.
- [ ] `GET /api/labels?all=1` renders a printable grid; print preview shows tidy, correctly-sized labels with names.
- [ ] The QR encodes an **absolute** URL using the request's external scheme/host (verify it's `https://…ts.net/i/…` when accessed via the tailnet, not `http://127.0.0.1`).
- [ ] 🖐 Print one, tape it to a jar, scan with the iOS Camera app → opens that item's quick-update screen.

## Definition of done

Decanted jars are trackable by scanning a printed label. Commit `P5: QR labels + deep links for decanted jars`. **Stop.**
