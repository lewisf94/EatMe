# EatMe OCR

EatMe OCR is the private receipt-recognition service used by EatMe. It is
packaged as a second Home Assistant app in the same repository.

The service accepts image bytes at `POST /ocr` and returns recognised text
lines as JSON. Tesseract and its English model are installed in the image for
both AMD64 and ARM64, so recognition does not depend on a cloud service or
runtime model download. Images are processed in memory and discarded.

## Home Assistant

1. Add `https://github.com/lewisf94/EatMe` as an app repository.
2. Install and start **EatMe OCR**.
3. In the main EatMe app, set `receipt_provider` to `local`, leave `ocr_url`
   blank, save and restart.

Home Assistant gives sibling apps a shared internal network. EatMe derives the
OCR hostname from its own repository-qualified hostname, so this works for
GitHub and local `/addons` installations without exposing port 8765 to the LAN.

## API

```text
GET  /health   -> {"ok":true,"engine":"tesseract"}
POST /ocr      -> {"lines":[{"text":"MILK 1.50","confidence":0.96}]}
```

The request body must be a PNG, JPEG or other Pillow-supported image and must
not exceed 15 MiB. Recognition has a 90-second server-side limit.

Clear, evenly lit photographs with the receipt filling the frame give the best
results. EatMe deliberately keeps a review step because supermarket
abbreviations and damaged receipts cannot be interpreted perfectly.
