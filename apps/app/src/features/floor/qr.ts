// The QR image of an area (FLR D13): an SVG string, error correction M, a quiet zone of 4 modules. No DOM.
import QRCode from "qrcode";

export function areaQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
}
