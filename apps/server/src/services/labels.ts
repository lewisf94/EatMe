import type { LabelContainer } from "../repo/containers.js";

export type PrintableLabel = Pick<
  LabelContainer,
  "id" | "displayName" | "productName" | "locationName"
> & {
  qrUrl: string;
  qrSvg: string;
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[char],
  );
}

export function qrTarget(origin: string, qrUid: string): string {
  return new URL(`/i/${encodeURIComponent(qrUid)}`, origin).toString();
}

export async function makePrintableLabel(
  container: LabelContainer,
  origin: string,
): Promise<PrintableLabel> {
  const qrUrl = qrTarget(origin, container.qrUid);
  const { default: QRCode } = await import("qrcode");
  const qrSvg = await QRCode.toString(qrUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 256,
  });
  return { ...container, qrUrl, qrSvg };
}

/** A self-contained A4 page: no remote fonts, scripts, or images are required
 *  when a phone or desktop opens the print preview. */
export function renderLabelPage(labels: PrintableLabel[]): string {
  const cards = labels
    .map((label) => {
      const detail = [label.productName, label.locationName].filter(Boolean).join(" · ");
      return `<article class="label">
        <div class="qr" aria-label="${escapeHtml(label.qrUrl)}">${label.qrSvg}</div>
        <div class="copy">
          <strong>${escapeHtml(label.displayName)}</strong>
          ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
        </div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EatMe labels</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #16130d; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f1e8; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px 18px; background: #16130d; color: white; }
    .toolbar strong { font-size: 18px; }
    button { border: 0; border-radius: 7px; padding: 9px 16px; background: #f3c94e;
      color: #17130a; font: 700 14px Arial, sans-serif; cursor: pointer; }
    .sheet { display: grid; grid-template-columns: repeat(3, 58mm); gap: 4mm;
      width: 194mm; margin: 8mm auto; padding: 0; }
    .label { display: grid; grid-template-columns: 25mm 1fr; align-items: center; gap: 3mm;
      width: 58mm; min-height: 30mm; padding: 2.5mm; overflow: hidden;
      border: .3mm solid #b8b1a3; border-radius: 2mm; background: white;
      break-inside: avoid; page-break-inside: avoid; }
    .qr, .qr svg { display: block; width: 25mm; height: 25mm; }
    .copy { min-width: 0; overflow-wrap: anywhere; }
    .copy strong { display: block; font-size: 9.5pt; line-height: 1.15; }
    .copy span { display: block; margin-top: 1.5mm; color: #595447; font-size: 7.5pt;
      line-height: 1.2; }
    @page { size: A4 portrait; margin: 8mm; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .sheet { margin: 0; }
    }
    @media screen and (max-width: 720px) {
      .sheet { grid-template-columns: 1fr; width: auto; margin: 14px; }
      .label { width: 100%; }
    }
  </style>
</head>
<body>
  <header class="toolbar">
    <strong>EatMe labels (${labels.length})</strong>
    <button type="button" onclick="window.print()">Print</button>
  </header>
  <main class="sheet">${cards}</main>
</body>
</html>`;
}
