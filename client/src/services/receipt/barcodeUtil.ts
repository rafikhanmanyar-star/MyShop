/**
 * Generate barcode as Base64 data URL using JsBarcode (no CDN).
 * Used for receipt template injection.
 */
import JsBarcode from 'jsbarcode';

const defaultOptions: Record<string, { format: string; [k: string]: unknown }> = {
  CODE128: { format: 'CODE128', width: 1.5, height: 28, displayValue: true, margin: 2 },
  CODE39: { format: 'CODE39', width: 1.5, height: 28, displayValue: true, margin: 2 },
  EAN13: { format: 'EAN13', width: 1.5, height: 28, displayValue: true, margin: 2 },
};

export function generateBarcodeBase64(
  value: string,
  type: 'CODE128' | 'CODE39' | 'EAN13' = 'CODE128'
): string | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const canvas = document.createElement('canvas');
    const opts = defaultOptions[type] || defaultOptions.CODE128;
    JsBarcode(canvas, value.trim(), opts);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
