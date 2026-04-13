/**
 * Configurable POS receipt template: pure HTML, inline CSS, no external deps.
 * Generates receipt HTML for 58mm/80mm thermal printers, optional barcode (no CDN).
 */
import { generateBarcodeBase64 } from './barcodeUtil';

export interface ReceiptSettings {
  show_logo?: boolean;
  show_barcode?: boolean;
  barcode_type?: 'CODE128' | 'CODE39' | 'EAN13';
  barcode_position?: 'header' | 'footer';
  barcode_size?: 'small' | 'medium' | 'large';
  receipt_width?: '58mm' | '80mm';
  show_tax_breakdown?: boolean;
  show_cashier_name?: boolean;
  show_shift_number?: boolean;
  footer_message?: string | null;
  /** When true, receipt shows mobile order URL QR at end with "Please scan to order from home" */
  show_mobile_url_qr?: boolean;
  /** Pre-generated QR data URL for mobile order (set by caller when show_mobile_url_qr is true) */
  mobile_qr_data_url?: string | null;
  /** Mobile order URL (server may include with receipt settings for preview/print) */
  mobile_order_url?: string | null;
  /** Printable margins in millimeters (thermal printers often need extra margin_right_mm) */
  margin_top_mm?: number;
  margin_bottom_mm?: number;
  margin_left_mm?: number;
  margin_right_mm?: number;
  /** Preset key: roboto_mono (default), courier_new, roboto, inter */
  print_font_family?: string;
  /** Base font size in px (clamped 10–18 in UI and server) */
  print_font_size?: number;
  /** normal | medium | bold */
  print_font_weight?: string;
  /** Line height multiplier (e.g. 1.2) */
  print_line_spacing?: number;
}

export const RECEIPT_PRINT_FONT_OPTIONS = [
  { value: 'roboto_mono', label: 'Roboto Mono', monospace: true },
  { value: 'courier_new', label: 'Courier New', monospace: true },
  { value: 'roboto', label: 'Roboto', monospace: false },
  { value: 'inter', label: 'Inter', monospace: false },
] as const;

export type ReceiptPrintFontFamily = (typeof RECEIPT_PRINT_FONT_OPTIONS)[number]['value'];

const PRINT_FONT_FAMILY_SET: Set<string> = new Set(RECEIPT_PRINT_FONT_OPTIONS.map((o) => o.value));

function resolveReceiptFont(key: string): { cssFamily: string; webFont: 'none' | 'roboto_mono' | 'roboto' | 'inter' } {
  switch (key) {
    case 'courier_new':
      return { cssFamily: "'Courier New', Courier, monospace", webFont: 'none' };
    case 'roboto':
      return { cssFamily: "'Roboto', 'Courier New', monospace", webFont: 'roboto' };
    case 'inter':
      return { cssFamily: "'Inter', 'Courier New', monospace", webFont: 'inter' };
    case 'roboto_mono':
    default:
      return { cssFamily: "'Roboto Mono', 'Courier New', monospace", webFont: 'roboto_mono' };
  }
}

function receiptFontLinkTags(webFont: 'none' | 'roboto_mono' | 'roboto' | 'inter'): string {
  if (webFont === 'none') return '';
  const preconnect =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
  if (webFont === 'roboto_mono') {
    return (
      preconnect +
      '<link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">'
    );
  }
  if (webFont === 'roboto') {
    return (
      preconnect +
      '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">'
    );
  }
  return (
    preconnect +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">'
  );
}

function clampPrintFontSize(px: unknown): number {
  const n = typeof px === 'number' ? px : parseInt(String(px ?? ''), 10);
  if (!Number.isFinite(n)) return 12;
  return Math.min(18, Math.max(10, Math.round(n)));
}

function clampLineSpacing(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return 1.2;
  return Math.min(2, Math.max(1, Math.round(n * 100) / 100));
}

function weightToCss(w: string | undefined): string {
  if (w === 'bold') return '700';
  if (w === 'medium') return '500';
  return '400';
}

export interface ReceiptSaleData {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  taxId?: string;
  logoUrl?: string | null;
  receiptNumber?: string;
  date?: string;
  time?: string;
  cashier?: string;
  shiftNumber?: string;
  customer?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    discount?: number;
    taxAmount?: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: Array<{ method: string; amount: number; reference?: string }>;
  change?: number;
  reprint_count?: number;
  barcode_value?: string | null;
  transactionId?: string;
}

const DEFAULT_SETTINGS: ReceiptSettings = {
  show_barcode: true,
  barcode_type: 'CODE128',
  barcode_position: 'footer',
  receipt_width: '80mm',
  show_tax_breakdown: false,
  show_cashier_name: true,
  show_shift_number: true,
  footer_message: null,
  margin_top_mm: 2,
  margin_bottom_mm: 2,
  margin_left_mm: 2,
  margin_right_mm: 4,
  print_font_family: 'roboto_mono',
  print_font_size: 12,
  print_font_weight: 'normal',
  print_line_spacing: 1.2,
};

function clampMarginMm(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(25, Math.max(0, n));
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate full receipt HTML. Kept under 50ms: no network, inline CSS, single barcode generation.
 */
export function generateReceiptHTML(
  saleData: ReceiptSaleData,
  settings: ReceiptSettings | null
): string {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const showBarcode = !!s.show_barcode && !!saleData.barcode_value;
  const barcodeType = (s.barcode_type === 'CODE39' || s.barcode_type === 'EAN13') ? s.barcode_type : 'CODE128';
  const barcodePosition = s.barcode_position === 'header' ? 'header' : 'footer';
  const widthMm = s.receipt_width === '58mm' ? 58 : 80;
  const mt = clampMarginMm(s.margin_top_mm, DEFAULT_SETTINGS.margin_top_mm!);
  const mr = clampMarginMm(s.margin_right_mm, DEFAULT_SETTINGS.margin_right_mm!);
  const mb = clampMarginMm(s.margin_bottom_mm, DEFAULT_SETTINGS.margin_bottom_mm!);
  const ml = clampMarginMm(s.margin_left_mm, DEFAULT_SETTINGS.margin_left_mm!);
  const contentWidthMm = Math.max(24, widthMm - ml - mr);
  const rawFontKey = String(s.print_font_family ?? 'roboto_mono');
  const fontKey = PRINT_FONT_FAMILY_SET.has(rawFontKey) ? rawFontKey : 'roboto_mono';
  const font = resolveReceiptFont(fontKey);
  const fontSizePx = clampPrintFontSize(s.print_font_size);
  const lineHeightMul = clampLineSpacing(s.print_line_spacing);
  const fontWeightCss = weightToCss(s.print_font_weight);
  const fontLinks = receiptFontLinkTags(font.webFont);
  const reprintLabel = (saleData.reprint_count ?? 0) > 0 ? '*** DUPLICATE COPY ***' : '';

  let barcodeDataUrl: string | null = null;
  if (showBarcode && saleData.barcode_value && typeof document !== 'undefined') {
    barcodeDataUrl = generateBarcodeBase64(saleData.barcode_value, barcodeType);
  }

  let barcodeMaxWidth = Math.min(contentWidthMm - 2, 50);
  let barcodeMinHeight = '18px';
  if (s.barcode_size === 'small') {
    barcodeMaxWidth = Math.min(contentWidthMm - 2, 35);
    barcodeMinHeight = '12px';
  } else if (s.barcode_size === 'large') {
    barcodeMaxWidth = Math.min(contentWidthMm - 2, 75);
    barcodeMinHeight = '24px';
  }

  const barcodeBlock =
    showBarcode && barcodeDataUrl
      ? `<div style="text-align:center;margin:1mm 0;"><img src="${barcodeDataUrl}" alt="Barcode" style="max-width:${barcodeMaxWidth}mm;width:100%;height:auto;min-height:${barcodeMinHeight};" /><div style="font-size:0.58em;margin-top:0.5mm;">${escapeHtml(saleData.barcode_value || '')}</div></div>`
      : '';

  const headerBarcode = barcodePosition === 'header' ? barcodeBlock : '';
  const footerBarcode = barcodePosition === 'footer' ? barcodeBlock : '';

  const logoBlock =
    s.show_logo && saleData.logoUrl
      ? `<div style="text-align:center;margin-bottom:1mm;"><img src="${escapeHtml(saleData.logoUrl)}" alt="Logo" style="max-width:${contentWidthMm - 2}mm;max-height:15mm;" /></div>`
      : '';

  const shopName = escapeHtml(saleData.storeName || 'My Shop');
  const address = saleData.storeAddress ? `<div style="text-align:center;font-size:0.9em;">${escapeHtml(saleData.storeAddress)}</div>` : '';
  const phone = saleData.storePhone ? `<div style="text-align:center;font-size:0.9em;">Tel: ${escapeHtml(saleData.storePhone)}</div>` : '';
  const taxId = saleData.taxId ? `<div style="text-align:center;font-size:0.9em;">Tax ID: ${escapeHtml(saleData.taxId)}</div>` : '';

  const duplicateBlock = reprintLabel
    ? `<div style="text-align:center;font-weight:700;font-size:0.85em;margin-bottom:1mm;">${reprintLabel}</div>`
    : '';

  const cashierLine = s.show_cashier_name
    ? `<div class="info-row"><span>Cashier:</span><span>${escapeHtml(saleData.cashier || '—')}</span></div>`
    : '';
  const shiftLine = s.show_shift_number && saleData.shiftNumber
    ? `<div class="info-row"><span>Shift:</span><span>${escapeHtml(saleData.shiftNumber)}</span></div>`
    : '';
  const customerLine = saleData.customer
    ? `<div class="info-row"><span>Customer:</span><span>${escapeHtml(saleData.customer)}</span></div>`
    : '';

  const itemsRows = saleData.items
    .map(
      (item) =>
        `<tr><td class="ri-name">${escapeHtml(item.name)}</td><td class="ri-qty">${item.quantity}</td><td class="ri-rate">${Number(item.unitPrice).toLocaleString()}</td><td class="ri-total">${Number(item.total).toLocaleString()}</td></tr>`
    )
    .join('');

  const taxBreakdownBlock = s.show_tax_breakdown
    ? `<div class="info-row"><span>Tax:</span><span>${Number(saleData.tax).toLocaleString()}</span></div>`
    : '';

  const paymentRows = saleData.payments
    .map(
      (p) =>
        `<div class="info-row"><span>${escapeHtml(p.method)}:</span><span>${Number(p.amount).toLocaleString()}</span></div>`
    )
    .join('');
  const changeLine = saleData.change != null && saleData.change > 0
    ? `<div class="info-row" style="font-weight:bold;"><span>Change:</span><span>${Number(saleData.change).toLocaleString()}</span></div>`
    : '';
  const transactionLine = saleData.transactionId
    ? `<div class="info-row info-row--micro"><span>Tx ID:</span><span>${escapeHtml(saleData.transactionId)}</span></div>`
    : '';

  const footerMessage = (s.footer_message && s.footer_message.trim()) ? escapeHtml(s.footer_message.trim()) : 'Thank you for your business!';
  const totalItems = saleData.items.reduce((sum, i) => sum + i.quantity, 0);

  const showMobileQr = !!s.show_mobile_url_qr && !!s.mobile_qr_data_url;
  const mobileQrBlock = showMobileQr
    ? `<div class="border-top text-center" style="margin-top: 2mm; padding-top: 2mm;">
<div style="font-size: 0.85em; margin-bottom: 1mm;">Please scan to order from home</div>
<div style="margin: 1mm 0;"><img src="${s.mobile_qr_data_url}" alt="Mobile order" style="max-width: 28mm; width: 100%; height: auto;" /></div>
</div>`
    : '';

  const pageSize = s.receipt_width === '58mm' ? '58mm auto' : '80mm auto';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${fontLinks}<style>
@page { size: ${pageSize}; margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm; }
html, body { min-height: 100vh; overflow: visible; display: block; margin: 0; width: 100%; box-sizing: border-box; }
/* @page margins apply when printing; browsers ignore @page for normal screen layout — mirror margins as body padding so iframe/preview updates live. */
@media screen {
  body { padding: ${mt}mm ${mr}mm ${mb}mm ${ml}mm; }
}
@media print {
  body { padding: 0 !important; }
}
body { font-family: ${font.cssFamily}; font-weight: ${fontWeightCss}; width: 100%; max-width: 100%; font-size: ${fontSizePx}px; line-height: ${lineHeightMul}; color: #000; background: #fff; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { box-sizing: border-box; }
.text-center { text-align: center; }
.font-bold { font-weight: bold; }
.border-top { border-top: 1px dashed #000; margin-top: 1mm; padding-top: 1mm; }
table.receipt-items { table-layout: fixed; width: 100%; border-collapse: collapse; margin: 1mm 0; }
table.receipt-items th { text-align: left; font-weight: 700; padding: 0.5mm 0; font-size: 0.9em; border-bottom: 1px solid #000; vertical-align: bottom; }
table.receipt-items td { padding: 0.5mm 0; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
table.receipt-items .ri-name { width: 40%; }
table.receipt-items .ri-qty { width: 12%; text-align: center; }
table.receipt-items .ri-rate { width: 23%; text-align: right; }
table.receipt-items .ri-total { width: 25%; text-align: right; }
.total-row { font-size: 1.1em; font-weight: 700; margin-top: 1mm; }
.info-row { display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 0.5mm; gap: 2mm; }
.info-row span:first-child { flex: 1 1 auto; min-width: 0; }
.info-row span:last-child { flex: 0 0 auto; text-align: right; }
.info-row--micro { font-size: 0.67em; }
</style></head><body>
${duplicateBlock}
${logoBlock}
<div class="text-center font-bold" style="font-size: 1.2em; margin-bottom: 0.5mm;">${shopName}</div>
${address}
${phone}
${taxId}
${headerBarcode}
<div class="border-top">
<div class="info-row"><span>Inv #:</span><span>${escapeHtml(saleData.receiptNumber || '—')}</span></div>
<div class="info-row"><span>Date:</span><span>${escapeHtml([saleData.date, saleData.time].filter(Boolean).join(' '))}</span></div>
${cashierLine}
${shiftLine}
${customerLine}
</div>
<table class="receipt-items">
<thead><tr><th class="ri-name">Item</th><th class="ri-qty">Qty</th><th class="ri-rate">Rate</th><th class="ri-total">Total</th></tr></thead>
<tbody>${itemsRows}</tbody>
</table>
<div class="border-top">
<div class="info-row"><span>Subtotal:</span><span>${Number(saleData.subtotal).toLocaleString()}</span></div>
${saleData.discount > 0 ? `<div class="info-row"><span>Discount:</span><span>-${Number(saleData.discount).toLocaleString()}</span></div>` : ''}
${taxBreakdownBlock || `<div class="info-row"><span>Tax:</span><span>${Number(saleData.tax).toLocaleString()}</span></div>`}
<div class="total-row" style="display:flex;justify-content:space-between;"><span>TOTAL:</span><span>${Number(saleData.total).toLocaleString()}</span></div>
</div>
<div class="border-top">
${paymentRows}
${changeLine}
${transactionLine}
</div>
${footerBarcode}
<div class="border-top text-center" style="margin-top: 1mm;">
<div style="font-size: 0.8em; margin-bottom: 1mm;">Total Items: ${totalItems}</div>
<div>${footerMessage}</div>
</div>
${mobileQrBlock}
</body></html>`;
}
