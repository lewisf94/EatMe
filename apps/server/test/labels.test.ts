import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  qrTarget,
  renderLabelPage,
  type PrintableLabel,
} from "../src/services/labels.js";

const label = (patch: Partial<PrintableLabel> = {}): PrintableLabel => ({
  id: "container-1",
  displayName: "Pasta jar",
  productName: "Pasta",
  locationName: "Cupboard",
  qrUrl: "https://home.example/i/abc",
  qrSvg: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>',
  ...patch,
});

describe("printable QR labels", () => {
  it("builds an encoded scan URL on the public origin", () => {
    expect(qrTarget("https://eatme.example:8123", "jar / 1")).toBe(
      "https://eatme.example:8123/i/jar%20%2F%201",
    );
  });

  it("escapes user-controlled label text", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("renders a self-contained A4 sheet with safe names", () => {
    const html = renderLabelPage([
      label({ displayName: "Jar <one>", productName: "Rice & beans" }),
      label({ id: "container-2", displayName: "Second jar" }),
    ]);
    expect(html).toContain("@page { size: A4 portrait");
    expect(html).toContain("EatMe labels (2)");
    expect(html).toContain("Jar &lt;one&gt;");
    expect(html).toContain("Rice &amp; beans");
    expect(html).not.toContain("Jar <one>");
    expect(html).toContain('<svg viewBox="0 0 1 1">');
  });
});
