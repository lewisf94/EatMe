"""Private local receipt OCR service for EatMe.

The service accepts a receipt image and returns text lines. Images are processed
in memory and discarded after each request. Product parsing and matching remain
in the EatMe server.
"""

from __future__ import annotations

import csv
import io
import json
import os
import subprocess
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

MAX_IMAGE_BYTES = 15 * 1024 * 1024
OCR_TIMEOUT_SECONDS = 90


def prepare_image(image_bytes: bytes) -> bytes:
    """Correct orientation and improve contrast for typical receipt photos."""
    with Image.open(io.BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert("L")
        if image.width < 1800:
            scale = 1800 / image.width
            image = image.resize(
                (1800, max(1, round(image.height * scale))),
                Image.Resampling.LANCZOS,
            )
        image = ImageOps.autocontrast(image, cutoff=1)
        image = ImageEnhance.Contrast(image).enhance(1.35)
        image = image.filter(ImageFilter.SHARPEN)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        return output.getvalue()


def tesseract_rows(image_bytes: bytes) -> list[dict[str, str]]:
    """Return Tesseract TSV rows without writing the receipt to disk."""
    completed = subprocess.run(
        ["tesseract", "stdin", "stdout", "--oem", "1", "--psm", "6", "-l", "eng", "tsv"],
        input=prepare_image(image_bytes),
        capture_output=True,
        check=True,
        timeout=OCR_TIMEOUT_SECONDS,
    )
    return list(
        csv.DictReader(
            io.StringIO(completed.stdout.decode("utf-8", errors="replace")),
            delimiter="\t",
        )
    )


def extract_lines(image_bytes: bytes) -> list[dict[str, object]]:
    """Group recognised words into top-to-bottom receipt lines."""
    grouped: dict[tuple[str, str, str, str], list[tuple[int, int, str, float]]] = defaultdict(list)
    for row in tesseract_rows(image_bytes):
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(row.get("conf") or -1)
            left = int(row.get("left") or 0)
            top = int(row.get("top") or 0)
        except ValueError:
            continue
        if confidence < 0:
            continue
        key = (
            row.get("page_num") or "0",
            row.get("block_num") or "0",
            row.get("par_num") or "0",
            row.get("line_num") or "0",
        )
        grouped[key].append((left, top, text, confidence))

    lines: list[tuple[int, dict[str, object]]] = []
    for words in grouped.values():
        words.sort(key=lambda word: word[0])
        text = " ".join(word[2] for word in words).strip()
        if not text:
            continue
        confidence = sum(word[3] for word in words) / len(words) / 100
        lines.append(
            (
                min(word[1] for word in words),
                {"text": text, "confidence": round(confidence, 4)},
            )
        )
    lines.sort(key=lambda line: line[0])
    return [line for _, line in lines]


class Handler(BaseHTTPRequestHandler):
    server_version = "EatMeOCR/0.1"

    def send_json(self, status: int, value: object) -> None:
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "engine": "tesseract"})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/ocr":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            self.send_json(400, {"error": "invalid content length"})
            return
        if length <= 0:
            self.send_json(400, {"error": "empty image body"})
            return
        if length > MAX_IMAGE_BYTES:
            self.send_json(413, {"error": "receipt image is too large"})
            return

        image = self.rfile.read(length)
        try:
            lines = extract_lines(image)
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "receipt recognition timed out"})
            return
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            self.send_json(400, {"error": f"could not read image: {error}"})
            return

        if not lines:
            self.send_json(422, {"error": "no readable text was found"})
            return
        self.send_json(200, {"lines": lines})

    def log_message(self, format: str, *args: object) -> None:
        # Do not write recognised receipt text or request details to the log.
        return


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"[eatme-ocr] listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
