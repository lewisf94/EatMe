import type { OcrResult } from "@eatme/shared";
import { config } from "../../config.js";

/** The OCR seam. Only *local* engines implement this — never a cloud API. */
export interface OcrProvider {
  extract(image: Buffer): Promise<OcrResult>;
}

/** A deterministic canned Tesco receipt so the whole pipeline (parse → match →
 *  review → stock) runs and is tested without the heavy model. */
export const STUB_RECEIPT: OcrResult = {
  merchant: "Tesco",
  lines: [
    { text: "TESCO" },
    { text: "STORE 2841 CAMBRIDGE" },
    { text: "CHCKPEAS 400G 0.45 A" },
    { text: "TESCO PASSATA 500G 0.35 A" },
    { text: "2 x TINNED TOMATOES 0.90" },
    { text: "OLIVE OIL 500ML 3.25 A" },
    { text: "CARRIER BAG 0.10" },
    { text: "CLUBCARD SAVING -0.50" },
    { text: "TOTAL 4.05" },
    { text: "VISA 4.05" },
    { text: "12/07/2026 14:32" },
  ],
};

class StubProvider implements OcrProvider {
  async extract(): Promise<OcrResult> {
    return STUB_RECEIPT;
  }
}

/** Calls the Python OCR sidecar over localhost only (PaddleOCR/docTR on the Pi). */
class LocalSidecarProvider implements OcrProvider {
  async extract(image: Buffer): Promise<OcrResult> {
    const res = await fetch(config.ocrUrl + "/ocr", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: image,
    });
    if (!res.ok) throw new Error(`OCR sidecar returned HTTP ${res.status}`);
    return (await res.json()) as OcrResult;
  }
}

export function ocrProvider(): OcrProvider {
  return config.receiptProvider === "local" ? new LocalSidecarProvider() : new StubProvider();
}
