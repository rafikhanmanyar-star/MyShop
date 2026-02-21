export interface ReceiptData {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  taxId?: string;
  receiptNumber?: string;
  date?: string;
  time?: string;
  cashier?: string;
  customer?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    discount?: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  change?: number;
  footer?: string;
  [key: string]: any;
}

export interface ThermalPrinter {
  print: (data: ReceiptData) => Promise<boolean>;
  printReceipt: (data: ReceiptData) => Promise<boolean>;
  testPrint: () => Promise<boolean>;
  [key: string]: any;
}

export function createThermalPrinter(config?: any): ThermalPrinter {
  const printReceipt = async (data: ReceiptData) => {
    console.log('🖨️ Printing receipt...', data);

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return false;

    const itemsHtml = data.items.map((item: any) => `
      <tr class="item-row">
        <td colspan="2" class="item-name">${item.name}</td>
      </tr>
      <tr class="item-details">
        <td>
          ${item.quantity} x ${item.unitPrice.toLocaleString()}
          ${item.discount > 0 ? `<br/><small>Disc: -${item.discount.toLocaleString()}</small>` : ''}
        </td>
        <td style="text-align: right; vertical-align: top;">${item.total.toLocaleString()}</td>
      </tr>
    `).join('');

    const html = `
      <html>
        <head>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 72mm; 
              padding: 4mm; 
              font-size: 11px;
              line-height: 1.2;
              color: black;
              background: white;
            }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .border-top { border-top: 1px dashed black; margin-top: 2mm; padding-top: 2mm; }
            .border-bottom { border-bottom: 1px dashed black; margin-bottom: 2mm; padding-bottom: 2mm; }
            table { width: 100%; border-collapse: collapse; }
            .mt-1 { margin-top: 1mm; }
            .mb-1 { margin-bottom: 1mm; }
            .item-name { padding-top: 1mm; font-weight: bold; }
            .item-details td { padding-bottom: 1mm; }
            .flex-between { display: flex; justify-content: space-between; }
            .total-row { font-size: 14px; font-weight: bold; padding-top: 1mm; }
          </style>
        </head>
        <body>
          <div class="text-center font-bold" style="font-size: 16px;">${data.storeName || 'My Shop'}</div>
          ${data.storeAddress ? `<div class="text-center">${data.storeAddress}</div>` : ''}
          ${data.storePhone ? `<div class="text-center">Tel: ${data.storePhone}</div>` : ''}
          ${data.taxId ? `<div class="text-center">Tax ID: ${data.taxId}</div>` : ''}
          
          <div class="border-top mt-1">
            <div class="flex-between">
              <span>Receipt #:</span>
              <span>${data.receiptNumber || 'N/A'}</span>
            </div>
            <div class="flex-between">
              <span>Date:</span>
              <span>${data.date} ${data.time}</span>
            </div>
            <div class="flex-between">
              <span>Cashier:</span>
              <span>${data.cashier || 'Admin'}</span>
            </div>
            ${data.customer ? `
            <div class="flex-between">
              <span>Customer:</span>
              <span>${data.customer}</span>
            </div>` : ''}
          </div>

          <div class="border-top mt-1 mb-1"></div>
          <table>
            <thead>
              <tr class="border-bottom font-bold">
                <th align="left">Description</th>
                <th align="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="border-top">
            <div class="flex-between">
              <span>Subtotal:</span>
              <span>${data.subtotal.toLocaleString()}</span>
            </div>
            ${data.discount > 0 ? `
            <div class="flex-between">
              <span>Discount:</span>
              <span>-${data.discount.toLocaleString()}</span>
            </div>` : ''}
            <div class="flex-between">
              <span>Tax:</span>
              <span>${data.tax.toLocaleString()}</span>
            </div>
            <div class="flex-between total-row">
              <span>TOTAL:</span>
              <span>${data.total.toLocaleString()}</span>
            </div>
          </div>

          <div class="border-top mt-1">
            ${data.payments.map((p: any) => `
              <div class="flex-between">
                <span>Payment (${p.method}):</span>
                <span>${p.amount.toLocaleString()}</span>
              </div>
            `).join('')}
            ${data.change ? `
            <div class="flex-between font-bold">
              <span>Change:</span>
              <span>${data.change.toLocaleString()}</span>
            </div>` : ''}
          </div>

          <div class="border-top text-center" style="margin-top: 4mm;">
            ${data.showBarcode && data.receiptNumber ? `
              <div style="margin-bottom: 4mm;">
                <img src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${data.receiptNumber}&scale=2&rotate=N&includetext=true" 
                     style="max-width: 100%; height: auto; min-height: 40px;" 
                     alt="Barcode" 
                />
                <div style="font-size: 8px; margin-top: 1mm;">${data.receiptNumber}</div>
              </div>
            ` : ''}
            ${data.footer || 'Thank you for your business!'}
            <div style="font-size: 8px; margin-top: 2mm;">Powered by AntiGravity POS</div>
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.parent.document.body.removeChild(window.frameElement);
              }, 100);
            };
          </script>
        </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    return true;
  };

  const testPrint = async () => {
    return printReceipt({
      storeName: 'Test Store',
      storeAddress: '123 Test St, Karachi',
      storePhone: '021-1234567',
      receiptNumber: 'TEST-001',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      items: [
        { name: 'Test Item 1', quantity: 1, unitPrice: 100, total: 100 },
        { name: 'Test Item 2', quantity: 2, unitPrice: 50, total: 100 }
      ],
      subtotal: 200,
      discount: 0,
      tax: 0,
      total: 200,
      payments: [{ method: 'Cash', amount: 200 }],
      footer: 'Browser Test Print',
      showBarcode: true
    });
  };

  return { print: printReceipt, printReceipt, testPrint };
}
