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
  receipt_width?: '58mm' | '80mm';
  show_tax_breakdown?: boolean;
  show_cashier_name?: boolean;
  show_shift_number?: boolean;
  footer_message?: string | null;
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
};

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
  const bodyWidth = widthMm - 8;
  const reprintLabel = (saleData.reprint_count ?? 0) > 0 ? '*** DUPLICATE COPY ***' : '';

  let barcodeDataUrl: string | null = null;
  if (showBarcode && saleData.barcode_value && typeof document !== 'undefined') {
    barcodeDataUrl = generateBarcodeBase64(saleData.barcode_value, barcodeType);
  }

  const barcodeBlock =
    showBarcode && barcodeDataUrl
      ? `<div style="text-align:center;margin:2mm 0;"><img src="${barcodeDataUrl}" alt="Barcode" style="max-width:${Math.min(bodyWidth - 4, 50)}mm;height:auto;min-height:18px;" /><div style="font-size:7px;margin-top:1mm;">${escapeHtml(saleData.barcode_value || '')}</div></div>`
      : '';

  const headerBarcode = barcodePosition === 'header' ? barcodeBlock : '';
  const footerBarcode = barcodePosition === 'footer' ? barcodeBlock : '';

  const logoBlock =
    s.show_logo && saleData.logoUrl
      ? `<div style="text-align:center;margin-bottom:2mm;"><img src="${escapeHtml(saleData.logoUrl)}" alt="Logo" style="max-width:${bodyWidth - 4}mm;max-height:20mm;" /></div>`
      : '';

  const shopName = escapeHtml(saleData.storeName || 'My Shop');
  const address = saleData.storeAddress ? `<div style="text-align:center;">${escapeHtml(saleData.storeAddress)}</div>` : '';
  const phone = saleData.storePhone ? `<div style="text-align:center;">Tel: ${escapeHtml(saleData.storePhone)}</div>` : '';
  const taxId = saleData.taxId ? `<div style="text-align:center;">Tax ID: ${escapeHtml(saleData.taxId)}</div>` : '';

  const duplicateBlock = reprintLabel
    ? `<div style="text-align:center;font-weight:bold;font-size:10px;margin-bottom:2mm;">${reprintLabel}</div>`
    : '';

  const cashierLine = s.show_cashier_name
    ? `<div style="display:flex;justify-content:space-between;"><span>Cashier:</span><span>${escapeHtml(saleData.cashier || '—')}</span></div>`
    : '';
  const shiftLine = s.show_shift_number && saleData.shiftNumber
    ? `<div style="display:flex;justify-content:space-between;"><span>Shift:</span><span>${escapeHtml(saleData.shiftNumber)}</span></div>`
    : '';
  const customerLine = saleData.customer
    ? `<div style="display:flex;justify-content:space-between;"><span>Customer:</span><span>${escapeHtml(saleData.customer)}</span></div>`
    : '';

  const itemsRows = saleData.items
    .map(
      (item) =>
        `<tr><td style="padding:1mm 0;word-wrap:break-word;max-width:${bodyWidth * 0.5}mm;">${escapeHtml(item.name)}</td><td style="text-align:center;">${item.quantity}</td><td style="text-align:right;">${Number(item.unitPrice).toLocaleString()}</td><td style="text-align:right;">${Number(item.total).toLocaleString()}</td></tr>`
    )
    .join('');

  const taxBreakdownBlock = s.show_tax_breakdown
    ? `<div style="display:flex;justify-content:space-between;"><span>Tax:</span><span>${Number(saleData.tax).toLocaleString()}</span></div>`
    : '';

  const paymentRows = saleData.payments
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;"><span>${escapeHtml(p.method)}:</span><span>${Number(p.amount).toLocaleString()}</span></div>`
    )
    .join('');
  const changeLine = saleData.change != null && saleData.change > 0
    ? `<div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Change:</span><span>${Number(saleData.change).toLocaleString()}</span></div>`
    : '';
  const transactionLine = saleData.transactionId
    ? `<div style="display:flex;justify-content:space-between;font-size:8px;"><span>Transaction ID:</span><span>${escapeHtml(saleData.transactionId)}</span></div>`
    : '';

  const footerMessage = (s.footer_message && s.footer_message.trim()) ? escapeHtml(s.footer_message.trim()) : 'Thank you for your business!';
  const totalItems = saleData.items.reduce((sum, i) => sum + i.quantity, 0);

  const bodyPadding = '4mm';
  const fontSize = widthMm === 58 ? '10px' : '11px';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { margin: 0; }
body { font-family: 'Courier New', Courier, monospace; width: 100%; margin: 0 auto; padding: ${bodyPadding}; font-size: ${fontSize}; line-height: 1.2; color: #000; background: #fff; box-sizing: border-box; }
* { box-sizing: border-box; }
.text-center { text-align: center; }
.font-bold { font-weight: bold; }
.border-top { border-top: 1px dashed #000; margin-top: 2mm; padding-top: 2mm; }
.border-bottom { border-bottom: 1px dashed #000; margin-bottom: 2mm; padding-bottom: 2mm; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: bold; }
th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
th:nth-child(4) { text-align: right; }
td:nth-child(2), td:nth-child(3) { text-align: center; }
td:nth-child(4) { text-align: right; }
.total-row { font-size: 14px; font-weight: bold; padding-top: 2mm; }
</style></head><body>
${duplicateBlock}
${logoBlock}
<div class="text-center font-bold" style="font-size: 16px;">${shopName}</div>
${address}
${phone}
${taxId}
${headerBarcode}
<div class="border-top">
<div style="display:flex;justify-content:space-between;"><span>Invoice #:</span><span>${escapeHtml(saleData.receiptNumber || '—')}</span></div>
<div style="display:flex;justify-content:space-between;"><span>Date:</span><span>${escapeHtml([saleData.date, saleData.time].filter(Boolean).join(' '))}</span></div>
${cashierLine}
${shiftLine}
${customerLine}
</div>
<div class="border-top"></div>
<table>
<thead><tr class="border-bottom font-bold"><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
<tbody>${itemsRows}</tbody>
</table>
<div class="border-top">
<div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${Number(saleData.subtotal).toLocaleString()}</span></div>
${saleData.discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Discount:</span><span>-${Number(saleData.discount).toLocaleString()}</span></div>` : ''}
${taxBreakdownBlock || `<div style="display:flex;justify-content:space-between;"><span>Tax:</span><span>${Number(saleData.tax).toLocaleString()}</span></div>`}
<div class="total-row" style="display:flex;justify-content:space-between;"><span>TOTAL:</span><span>${Number(saleData.total).toLocaleString()}</span></div>
</div>
<div class="border-top">
${paymentRows}
${changeLine}
${transactionLine}
</div>
${footerBarcode}
<div class="border-top text-center" style="margin-top: 4mm;">
<div style="font-size: 9px;">Total Items: ${totalItems}</div>
<div style="margin-top: 2mm;">${footerMessage}</div>
</div>
</body></html>`;
}
