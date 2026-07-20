import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/pure";
// Vite emits this as a hashed, same-origin asset (and Workbox precaches it),
// so scanning works offline and under a strict CSP — no CDN fetch.
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith(".wasm") ? zxingWasmUrl : prefix + path,
});

export { BarcodeDetector };
export type { DetectedBarcode } from "barcode-detector/pure";

/** The 1-D grocery formats we care about. */
export const GROCERY_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
