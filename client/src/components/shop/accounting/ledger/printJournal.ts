import type { LedgerJournalEntry } from './types';
import { ledgerLineTotals } from './LedgerToolbar';

export function printJournalEntry(entry: LedgerJournalEntry, opts?: { storeLabel?: string }) {
  const dateStr =
    typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);
  const readable = () => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };
  const { debit: td, credit: tc } = ledgerLineTotals(entry);
  const lineRows =
    entry.lines?.map((l) => {
      const d = Number(l.debit || 0) > 0 ? Number(l.debit).toLocaleString() : '';
      const c = Number(l.credit || 0) > 0 ? Number(l.credit).toLocaleString() : '';
      return `<tr><td>${escapeHtml(`${l.accountCode || ''} — ${l.accountName || ''}`)}</td><td style="text-align:right">${d}</td><td style="text-align:right">${c}</td></tr>`;
    }).join('') || '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(entry.reference)}</title>
  <style>
    body{font-family:Inter,system-ui,sans-serif;margin:40px;color:#111}
    h1{font-size:20px;margin:0 0 8px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
    th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
    th{background:#eef2ff}
    .muted{color:#6b7280;font-size:12px}
    .tot{font-weight:bold;margin-top:16px}
  </style></head><body>
  <h1>Journal — ${escapeHtml(entry.reference)}</h1>
  <p class="muted">Posted ${readable()} · Source ${escapeHtml(entry.sourceModule || '')}${
    opts?.storeLabel ? ` · Store: ${escapeHtml(opts.storeLabel)}` : ''
  }</p>
  ${entry.description ? `<p>${escapeHtml(entry.description)}</p>` : ''}
  <table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${lineRows}</tbody></table>
  <p class="tot">Total debit: ${td.toLocaleString()} &nbsp;&nbsp; Total credit: ${tc.toLocaleString()}</p>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=800');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
