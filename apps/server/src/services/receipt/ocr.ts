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

/** Calls the private EatMe OCR service on the Home Assistant app network. */
class LocalSidecarProvider implements OcrProvider {
  async extract(image: Buffer): Promise<OcrResult> {
    let res: Response;
    try {
      res = await fetch(config.ocrUrl + "/ocr", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: image,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(
        `Local receipt OCR is unavailable at ${config.ocrUrl}. Install and start the EatMe OCR Home Assistant app${detail}`,
      );
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Local receipt OCR returned HTTP ${res.status}`);
    }
    const result = (await res.json()) as OcrResult;
    if (!Array.isArray(result.lines) || result.lines.length === 0)
      throw new Error("Local receipt OCR found no readable text");
    return result;
  }
}

export function ocrProvider(): OcrProvider {
  return config.receiptProvider === "local" ? new LocalSidecarProvider() : new StubProvider();
}
