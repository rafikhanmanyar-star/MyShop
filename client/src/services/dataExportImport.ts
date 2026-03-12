/**
 * Export/import helpers for Settings → Data: templates, export to Excel, parse uploaded file.
 * Uses xlsx (SheetJS). Row numbers in errors are 1-based Excel rows (row 2 = first data row).
 */
import * as XLSX from 'xlsx';

export type DataType = 'skus' | 'inventory' | 'bills' | 'payments';

const SKU_HEADERS = ['Name', 'SKU', 'Barcode', 'Category', 'Unit', 'Cost Price', 'Retail Price', 'Tax Rate (%)', 'Reorder Point'];
const SKU_SAMPLE = ['Sample Product', 'SKU-001', '', 'General', 'pcs', 10, 25, 0, 10];

const INVENTORY_HEADERS = ['SKU', 'Warehouse Code', 'Quantity'];
const INVENTORY_SAMPLE = ['SKU-001', 'MAIN', 100];

const BILLS_HEADERS = ['Bill Number', 'Bill Date', 'Due Date', 'Supplier Name', 'SKU', 'Quantity', 'Unit Cost', 'Tax Amount', 'Subtotal'];
const BILLS_SAMPLE = ['PB-001', '2025-01-15', '2025-02-15', 'Acme Corp', 'SKU-001', 10, 10, 0, 100];

const PAYMENTS_HEADERS = ['Supplier Name', 'Payment Date', 'Amount', 'Payment Method', 'Bank Account Name', 'Reference', 'Notes', 'Bill Number', 'Amount Allocated'];
const PAYMENTS_SAMPLE = ['Acme Corp', '2025-01-20', 100, 'Bank', 'Main Account', 'CHQ-001', '', 'PB-001', 100];

function sheetFromArrays(rows: (string | number)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  return ws;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
}

/** Download a template file for the given data type (headers + one sample row). */
export function downloadTemplate(type: DataType): void {
  let headers: string[];
  let sample: (string | number)[];
  let name: string;
  switch (type) {
    case 'skus':
      headers = SKU_HEADERS;
      sample = SKU_SAMPLE;
      name = 'SKUs';
      break;
    case 'inventory':
      headers = INVENTORY_HEADERS;
      sample = INVENTORY_SAMPLE;
      name = 'Inventory';
      break;
    case 'bills':
      headers = BILLS_HEADERS;
      sample = BILLS_SAMPLE;
      name = 'Bills';
      break;
    case 'payments':
      headers = PAYMENTS_HEADERS;
      sample = PAYMENTS_SAMPLE;
      name = 'Payments';
      break;
    default:
      return;
  }
  const ws = sheetFromArrays([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  const filename = `MyShop_${name}_Template_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadWorkbook(wb, filename);
}

/** Build and download export workbook from data rows (array of objects). */
export function downloadExport(type: DataType, data: any[]): void {
  if (!data.length) return;
  const first = data[0];
  const headers = Object.keys(first);
  const rows = data.map((row) => headers.map((h) => row[h] ?? ''));
  const ws = sheetFromArrays([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  const sheetName = type === 'skus' ? 'SKUs' : type === 'inventory' ? 'Inventory' : type === 'bills' ? 'Bills' : 'Payments';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filename = `MyShop_${sheetName}_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadWorkbook(wb, filename);
}

/** Parse an uploaded Excel file and return array of row objects (first sheet). Row 1 = headers. */
export function parseExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('No file data'));
          return;
        }
        const wb = XLSX.read(data, { type: 'binary' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          resolve([]);
          return;
        }
        const ws = wb.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
        resolve(Array.isArray(json) ? json : []);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}
