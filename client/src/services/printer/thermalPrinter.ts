import { generateReceiptHTML } from '../receipt/receiptBuilder';
import type { ReceiptSettings, ReceiptSaleData } from '../receipt/receiptBuilder';

export interface ReceiptData {
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
  footer?: string;
  reprint_count?: number;
  barcode_value?: string | null;
  transactionId?: string;
  [key: string]: any;
}

export interface ThermalPrinter {
  print: (data: ReceiptData) => Promise<boolean>;
  printReceipt: (data: ReceiptData) => Promise<boolean>;
  testPrint: () => Promise<boolean>;
  [key: string]: any;
}

declare global {
  interface Window {
    electronAPI?: {
      printReceiptSilent?: (html: string, printerName?: string) => Promise<boolean>;
      getAppVersion?: () => Promise<string>;
      checkForUpdates?: () => Promise<void>;
      onUpdateStatus?: (cb: (payload: { status: string; message?: string; version?: string; percent?: number }) => void) => () => void;
      startUpdateDownload?: () => Promise<void>;
      quitAndInstall?: () => Promise<void>;
    };
  }
}

function buildReceiptSaleData(data: ReceiptData): ReceiptSaleData {
  return {
    storeName: data.storeName,
    storeAddress: data.storeAddress,
    storePhone: data.storePhone,
    taxId: data.taxId,
    logoUrl: data.logoUrl,
    receiptNumber: data.receiptNumber,
    date: data.date,
    time: data.time,
    cashier: data.cashier,
    shiftNumber: data.shiftNumber,
    customer: data.customer,
    items: data.items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      discount: item.discount,
      taxAmount: item.taxAmount,
    })),
    subtotal: data.subtotal,
    discount: data.discount,
    tax: data.tax,
    total: data.total,
    payments: data.payments.map((p: any) => ({ method: p.method, amount: p.amount, reference: p.reference })),
    change: data.change,
    reprint_count: data.reprint_count,
    barcode_value: data.barcode_value,
    transactionId: data.transactionId,
  };
}

export function createThermalPrinter(config?: { receiptSettings?: ReceiptSettings | null; printSettings?: any }): ThermalPrinter {
  const receiptSettings: ReceiptSettings | null = config?.receiptSettings ?? null;

  const printReceipt = async (data: ReceiptData): Promise<boolean> => {
    try {
      const saleData = buildReceiptSaleData(data);
      const settings: ReceiptSettings = {
        ...receiptSettings,
        footer_message: receiptSettings?.footer_message ?? data.footer ?? null,
      };
      const html = generateReceiptHTML(saleData, settings);

      // Prefer Electron silent print (no dialog, non-blocking)
      const electronPrint = (window as Window).electronAPI?.printReceiptSilent;
      if (electronPrint) {
        const printerName = data.printerName ?? config?.printSettings?.default_printer_name ?? undefined;
        const ok = await electronPrint(html, printerName);
        return !!ok;
      }

      // Fallback: hidden iframe + window.print()
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) return false;

      doc.open();
      doc.write(html);
      doc.close();

      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          try {
            const win = iframe.contentWindow;
            if (win) {
              win.focus();
              win.print();
            }
          } catch (e) {
            console.error('Iframe print failed:', e);
          }
          setTimeout(() => {
            try {
              if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            } catch (_) { }
            resolve(true);
          }, 1000);
        }, 300);
      });
    } catch (err) {
      console.error('Failed to print receipt:', err);
      return false;
    }
  };

  const testPrint = async () => {
    return printReceipt({
      storeName: 'Test Store',
      storeAddress: '123 Test St',
      storePhone: '021-1234567',
      receiptNumber: 'TEST-001',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      items: [
        { name: 'Test Item 1', quantity: 1, unitPrice: 100, total: 100 },
        { name: 'Test Item 2', quantity: 2, unitPrice: 50, total: 100 },
      ],
      subtotal: 200,
      discount: 0,
      tax: 0,
      total: 200,
      payments: [{ method: 'Cash', amount: 200 }],
      footer: 'Browser Test Print',
      barcode_value: 'SALE|T01|TEST-001',
    });
  };

  return { print: printReceipt, printReceipt, testPrint };
}
