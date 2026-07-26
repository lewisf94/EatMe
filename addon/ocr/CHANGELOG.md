# Changelog

## 0.1.0

- Package the OCR service as an installable Home Assistant app.
- Use the locally installed Tesseract English model on AMD64 and ARM64.
- Correct image orientation, increase contrast and group recognised words into
  receipt lines without storing the uploaded image.
- Add request-size and recognition-time limits.
