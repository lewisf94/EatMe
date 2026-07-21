# EatMe OCR sidecar (local, no cloud)

Turns a receipt photo into text lines for the EatMe server to parse. It runs
**on your Pi** and is only reachable over the local network — the receipt image
never leaves the device. EatMe works without it (using a built-in stub); the
sidecar is what makes real receipt scanning light up.

## Contract

```
POST /ocr    body: raw image bytes    →  { "lines": [ { "text": "...", "confidence": 0.98 }, ... ] }
GET  /health                          →  { "ok": true }
```

That's the whole interface. All parsing, product matching and alias-learning
happen in the EatMe Node server (and are unit-tested there); this service only
does OCR, so you can swap the engine (PaddleOCR ↔ docTR ↔ Tesseract) by editing
`extract_lines` in `server.py` without touching EatMe.

## Run it (🖐 on the Pi)

Build context is this directory:

```sh
docker build -t eatme-ocr addon/ocr
docker run -d --restart unless-stopped -p 8765:8765 --name eatme-ocr eatme-ocr
```

First request is slow (model load, tens of seconds); after that a receipt is a
few seconds on a Pi 5 8 GB.

## Point EatMe at it

Set these on the EatMe add-on/server, then restart it:

| var                | value                         |
| ------------------ | ----------------------------- |
| `RECEIPT_PROVIDER` | `local`                       |
| `OCR_URL`          | `http://<pi-host-or-ip>:8765` |

On Home Assistant OS the cleanest layout is to run this as a **second add-on** so
both containers share the internal Docker network; then `OCR_URL` is
`http://<ocr-addon-slug>:8765`. If you instead `docker run` it as above, use the
Pi's LAN address.

Leave `RECEIPT_PROVIDER` unset (defaults to `stub`) and EatMe still runs — the
receipt screen just returns a canned example until the sidecar is wired up.

## Route A vs Route B

This ships **Route A** (OCR + EatMe's own parsing + alias learning), the right
fit for a Pi 5 8 GB. A receipt-understanding model (Donut / PaddleOCR-VL, "Route
B") is a drop-in replacement here if you ever move the server to a mini-PC — it
would return the same `/ocr` shape. Either way it stays local.
