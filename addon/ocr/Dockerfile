# EatMe OCR sidecar (PaddleOCR). Runs on the Pi next to the EatMe add-on; the
# EatMe server calls it over the local network only. No cloud.
#
# NOTE (🖐 validate on the Pi): PaddlePaddle wheels for aarch64 (Pi 5, 64-bit
# HAOS) can lag. If `pip install paddlepaddle` fails on your Pi, either pin a
# known aarch64 build or switch this image to docTR (`pip install python-doctr`)
# and adjust extract_lines in server.py — the /ocr contract stays the same.
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir paddlepaddle paddleocr pillow numpy

COPY server.py /app/server.py
WORKDIR /app
ENV PORT=8765
EXPOSE 8765
CMD ["python", "server.py"]
