declare module "qrcode" {
  type SvgOptions = {
    type: "svg";
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
  };

  const QRCode: {
    toString(text: string, options: SvgOptions): Promise<string>;
  };

  export default QRCode;
}
