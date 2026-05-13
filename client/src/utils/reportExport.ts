import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

function downloadBlob(filename: string, mime: string, data: BlobPart) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsAsCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  downloadBlob(filename, 'text/csv;charset=utf-8', '\uFEFF' + lines.join('\n'));
}

export function exportRowsAsXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Report');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf);
}

export function exportRowsAsPdf(
  title: string,
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  orientation: 'p' | 'l' = 'l'
) {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 40, 48);
  autoTable(doc, {
    startY: 64,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 71, 171] },
  });
  doc.save(filename);
}

export function exportReportTable(
  format: ExportFormat,
  baseName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (format === 'csv') exportRowsAsCsv(`${baseName}-${stamp}.csv`, headers, rows);
  else if (format === 'xlsx') exportRowsAsXlsx(`${baseName}-${stamp}.xlsx`, baseName, headers, rows);
  else exportRowsAsPdf(baseName, `${baseName}-${stamp}.pdf`, headers, rows, 'l');
}
