# RC · Receipt import — local OCR, no cloud (the primary intake)

**Why:** Lewis won't add items one at a time, and doesn't want to depend on a
cloud service that could go down. So the main way stock gets in is: **photograph a
receipt → it becomes a reviewable batch → confirm → stock lots created** — all
running on the Pi, nothing external.

**Prerequisites:** [DM](11-phase-data-model.md) (needs stable product identity +
aliases). **Non-negotiable:** every import ends at a **review screen** — assisted
import, never blind auto-creation.

> **Open sizing decision (confirm before building):** which Pi (model + RAM)?
> 8 GB Pi 4/5 → **PaddleOCR** (`PP-Structure`) comfortably. 2–4 GB → lighter
> **Tesseract** + more parsing, or offload. A receipt-understanding model
> (**Donut**/PaddleOCR-VL, structured JSON directly) is an upgrade path for a
> beefier host. All are self-hosted; pick behind a provider seam so it's swappable
> but **local by default**.

## Architecture (all on the Pi)

```
PWA: capture receipt photo(s)  ──►  server  ──►  OCR service (local container)
   (compress + strip EXIF)                         PaddleOCR / Tesseract → text+boxes
                                          │
                                   parse into candidate lines
                                   (group by row, split price column,
                                    drop totals/discounts/store lines)
                                          │
                                   match each line:
                                   1 exact retailer alias
                                   2 exact normalized product
                                   3 fuzzy/token local match
                                   4 top-3 suggestions
                                   5 create new product
                                          │
                                   REVIEW SCREEN  ──►  confirm ──► one transaction:
                                                       create stock_lots + learn aliases
```

- **OCR as its own local service/container** (`whattoeat-ocr`, Python) the Node
  server calls over `localhost`. A `RECEIPT_PROVIDER` seam (`local` default)
  keeps it swappable without touching the app. **No outbound network** — works
  with the internet unplugged.
- **Aliases do the heavy lifting.** UK receipts abbreviate (`TESCO CHCKPEAS 400G`).
  After one confirmation → `receipt_aliases` maps it to the product; every future
  Tesco receipt matches instantly. Match order is alias → exact → fuzzy →
  suggestions → new. **Never** fire OFF text-search per line.

## New tables (migration `00Y_receipts.sql`)

```sql
purchases (id, merchant, purchased_at, source, image_hash, created_at)
purchase_lines (id, purchase_id, raw_text, normalized_text, quantity,
                unit_price, line_total, extraction_confidence,
                matched_product_id, status)     -- pending|added|ignored|not_tracked
receipt_aliases (id, retailer, normalized_text, product_id,
                 confirmed_count, last_seen_at)
```

Prices are kept only to help dedupe/explain a line — **not** to become a budgeting
app (out of scope).

## Review screen

Per line: raw text · suggested match · action (**Add / Ignore / Not tracked /
New**) · quantity · location. The user can fix the match, add an unmatched product
fast, and leave dates blank (entered later per lot). Confirm → creates the lots
and saves any new aliases. Support **long receipts** as sequential photos with
overlap de-dup into one combined review.

## Privacy (defaults)

Strip EXIF before upload; don't log raw OCR; **delete the photo after extraction**;
store only the parsed lines + an `image_hash` (duplicate detection). Disclose if a
non-local provider is ever selected.

## Benchmark before trusting it

Build the provider seam, then run **30–50 real anonymised receipts** from the
household's actual shops (Tesco/Aldi/Lidl/Sainsbury's…). Measure the metric that
matters: **taps to turn a real receipt into correct inventory** — plus
product-line recall, false lines, merchant/date accuracy, and time per receipt.
OCR character accuracy is not the target.

## Acceptance checklist

- [ ] A fixture receipt image → OCR → parsed lines → review → confirm **creates
      the right stock lots** in one transaction. (Committed test with a golden
      fixture.)
- [ ] Confirming a line **learns an alias**; re-importing the same retailer line
      auto-matches with no correction.
- [ ] Non-product lines (bag, discount, loyalty) are excluded by default.
- [ ] EXIF stripped; photo deleted after extraction; only lines + hash stored.
- [ ] Runs **fully offline** (no external calls in the whole flow).
- [ ] Multi-photo long receipt merges into one review without duplicate lines.

## Definition of done

A photographed receipt becomes reviewed, confirmed inventory — locally, no cloud.
Commit `RC: local receipt import (OCR + aliases + review)`. **Stop.**

## Complementary (low priority): rapid barcode "put-away"

A scan-many mode (reuses the P3 scanner: scan → qty/location → next) is more
*accurate* for identity but is still per-item, which Lewis won't do. Keep it as an
optional secondary intake for the occasional single item; **receipts are primary.**
