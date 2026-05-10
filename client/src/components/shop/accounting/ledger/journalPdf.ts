import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LedgerJournalEntry } from './types';
import { ledgerLineTotals } from './LedgerToolbar';

export function downloadJournalPdf(entry: LedgerJournalEntry, opts?: { storeLabel?: string; createdBy?: string }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Journal entry', 14, 16);
  doc.setFontSize(10);
  const ref = entry.reference || '—';
  doc.text(`Reference: ${ref}`, 14, 24);

  let y = 30;
  const dateStr =
    typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);
  doc.text(`Date: ${dateStr}`, 14, y);
  y += 6;
  doc.text(`Source: ${entry.sourceModule || '—'}`, 14, y);
  y += 6;
  if (opts?.storeLabel) doc.text(`Store context: ${opts.storeLabel}`, 14, y);
  y += 6;
  if (opts?.createdBy) doc.text(`Created / context: ${opts.createdBy}`, 14, y);
  y += 8;
  if (entry.description) {
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', 14, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
    const lines = doc.splitTextToSize(String(entry.description), 180);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;
  }

  const rows =
    entry.lines?.map((l) => [
      `${l.accountCode || ''} — ${l.accountName || ''}`,
      Number(l.debit || 0) > 0 ? Number(l.debit).toLocaleString() : '',
      Number(l.credit || 0) > 0 ? Number(l.credit).toLocaleString() : '',
    ]) || [];

  autoTable(doc, {
    startY: y,
    head: [['Account', 'Debit', 'Credit']],
    body: rows.length ? rows : [['—', '', '']],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [79, 70, 229] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;
  const { debit: td, credit: tc } = ledgerLineTotals(entry);
  doc.setFontSize(10);
  doc.text(`Totals — Debit: ${td.toLocaleString()}  Credit: ${tc.toLocaleString()}`, 14, finalY + 12);

  const safe = ref.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40);
  doc.save(`journal-${safe}-${dateStr}.pdf`);
}
