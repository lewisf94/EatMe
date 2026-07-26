# EatMe OCR

EatMe OCR reads receipt photographs for the EatMe app. Recognition runs on
your Home Assistant machine; receipt images are processed in memory and are not
stored or sent to an external service.

Install and start this app before enabling the `local` receipt provider in
EatMe. Keep **Start on boot** and **Watchdog** enabled. EatMe discovers this app
automatically when both apps were installed from the same repository, so the
`ocr_url` option can normally remain blank.

The app has no web interface. A successful startup log ends with:

```text
[eatme-ocr] listening on :8765
```

Tesseract performs the text recognition. Clear, evenly lit photographs with
the whole receipt filling the frame give the best results. The EatMe review
screen remains the final check before anything is added to the inventory.
