"""EatMe OCR sidecar — local receipt OCR over localhost, no cloud.

A deliberately dumb service: it turns receipt image bytes into text lines (in
reading order) and nothing more. All the parsing/matching/alias logic lives in
the Node server, where it is unit-tested. Contract:

    POST /ocr   body: raw image bytes   ->   {"lines": [{"text": str, "confidence": float}, ...]}
    GET  /health                        ->   {"ok": true}

Swapping PaddleOCR for docTR/Tesseract only changes `extract_lines` below; the
contract the Node `LocalSidecarProvider` expects stays the same.
"""

import io
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

# PP-Structure/OCR, English. Loaded once at startup (first call is slow).
_ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


def extract_lines(image_bytes: bytes):
    img = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
    result = _ocr.ocr(img, cls=True) or []
    lines = []
    for page in result:
        for box, (text, conf) in page or []:
            y_top = min(p[1] for p in box)
            lines.append((y_top, {"text": text, "confidence": float(conf)}))
    lines.sort(key=lambda pair: pair[0])  # top-to-bottom reading order
    return [line for _, line in lines]


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("content-length", 0))
        data = self.rfile.read(length) if length else b""
        if not data:
            return self._json(400, {"error": "empty image body"})
        try:
            lines = extract_lines(data)
        except Exception as exc:  # noqa: BLE001 — report, don't crash the service
            return self._json(400, {"error": f"could not read image: {exc}"})
        self._json(200, {"lines": lines})

    def log_message(self, *args):  # keep stdout quiet (privacy: no raw OCR logs)
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"EatMe OCR sidecar listening on :{port}", flush=True)
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
