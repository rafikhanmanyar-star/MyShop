import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface PurchaseOrderPdfLine {
  productName: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  taxAmount: number;
  subtotal: number;
}

export interface PurchaseOrderPdfInput {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  billNumber: string;
  billDate: string;
  dueDate?: string;
  supplierName: string;
  supplierPhone?: string;
  supplierAddress?: string;
  paymentStatus?: string;
  notes?: string;
  lines: PurchaseOrderPdfLine[];
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  currencyLabel: string;
}

function safe(s: string | undefined | null): string {
  return (s ?? '').toString().trim();
}

/** Digits only for wa.me (country code, no +). */
export function normalizeWhatsAppPhone(raw: string | undefined | null): string | undefined {
  const t = safe(raw);
  if (!t) return undefined;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 8) return undefined;
  return digits;
}

export function generatePurchaseOrderPdfBlob(input: PurchaseOrderPdfInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Purchase order', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(safe(input.shopName) || 'Shop', margin, y);
  y += 5;
  if (input.shopAddress) {
    doc.text(input.shopAddress, margin, y);
    y += 5;
  }
  if (input.shopPhone) {
    doc.text(`Tel: ${input.shopPhone}`, margin, y);
    y += 5;
  }
  y += 3;

  doc.setFont('helvetica', 'bold');
  doc.text('Supplier', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(safe(input.supplierName) || '—', margin + 28, y);
  y += 5;
  if (input.supplierAddress) {
    doc.text(input.supplierAddress, margin, y);
    y += 5;
  }
  if (input.supplierPhone) {
    doc.text(`Contact: ${input.supplierPhone}`, margin, y);
    y += 5;
  }
  y += 4;

  const meta: string[][] = [
    ['PO / Bill #', input.billNumber],
    ['Date', input.billDate],
  ];
  if (input.dueDate) meta.push(['Due date', input.dueDate]);
  if (input.paymentStatus) meta.push(['Payment', input.paymentStatus]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: meta,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  const head = [['Product', 'SKU', 'Qty', `Unit (${input.currencyLabel})`, `Tax (${input.currencyLabel})`, `Line (${input.currencyLabel})`]];
  const body = input.lines.map((l) => [
    l.productName,
    l.sku || '—',
    String(l.quantity),
    l.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    (l.taxAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    l.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head,
    body,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 22 },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 26 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(10);
  doc.text(`Subtotal: ${input.currencyLabel} ${input.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, y);
  y += 5;
  doc.text(`Tax: ${input.currencyLabel} ${input.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total: ${input.currencyLabel} ${input.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    margin,
    y
  );
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (input.notes) {
    doc.text(`Notes: ${input.notes}`, margin, y, { maxWidth: 180 });
  }

  return doc.output('blob');
}

export async function sharePurchaseOrderPdfToWhatsApp(
  blob: Blob,
  filename: string,
  options?: { vendorPhone?: string; caption?: string }
): Promise<'shared' | 'downloaded'> {
  const caption =
    options?.caption ??
    'Purchase order — PDF is attached or was saved to your device; attach it in WhatsApp if needed.';
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };

  if (typeof nav.share === 'function') {
    const shareData: ShareData = { files: [file], title: 'Purchase order', text: caption };
    if (typeof nav.canShare === 'function' && !nav.canShare(shareData)) {
      // fall through to download
    } else {
      try {
        await nav.share(shareData);
        return 'shared';
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError') {
          return 'shared';
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const phone = normalizeWhatsAppPhone(options?.vendorPhone);
  const msg = encodeURIComponent(
    `${caption}\n\n(File "${filename}" was downloaded — open WhatsApp and attach it from your files or Downloads.)`
  );
  const waUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return 'downloaded';
}
