# Local receipt OCR for EatMe. Tesseract is available from Debian's ARM64 and
# AMD64 repositories and does not download models while the app is running.
FROM python:3.14-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      fonts-dejavu-core \
      tesseract-ocr \
      tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir Pillow==11.3.0

COPY server.py test_server.py /app/
WORKDIR /app

ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="amd64"
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.title="EatMe OCR" \
      org.opencontainers.image.description="Private local receipt text recognition for EatMe" \
      org.opencontainers.image.source="https://github.com/lewisf94/EatMe" \
      org.opencontainers.image.licenses="MIT"

ENV PORT=8765 \
    PYTHONUNBUFFERED=1

EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=3)"]

CMD ["python", "/app/server.py"]
