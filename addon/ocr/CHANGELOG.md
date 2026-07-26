# Changelog

## 0.1.1

- Preserve more thin print during image cleanup and add a clean segmentation
  border.
- Crop dark surroundings automatically, then compare Tesseract page
  segmentation modes 4 and 6 with standard and Sauvola thresholding.
- Rejoin text and prices by their physical row even when Tesseract separates
  them into different blocks.
- Add privacy-safe recognition summaries to the app log.

## 0.1.0

- Package the OCR service as an installable Home Assistant app.
- Use the locally installed Tesseract English model on AMD64 and ARM64.
- Correct image orientation, increase contrast and group recognised words into
  receipt lines without storing the uploaded image.
- Add request-size and recognition-time limits.
