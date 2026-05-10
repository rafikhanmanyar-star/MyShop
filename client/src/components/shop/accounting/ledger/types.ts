export type LedgerSourceFilter = 'all' | 'POS' | 'MobileApp' | 'Manual';

export interface JournalLineRow {
  id?: string;
  accountId: string;
  accountName: string;
  accountCode: string;
  accountType?: string;
  debit: number;
  credit: number;
}

/** Journal entry shape from paginated ledger API */
export interface LedgerJournalEntry {
  id: string;
  date: string;
  reference: string;
  description?: string | null;
  status?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  createdAt?: string | null;
  lines: JournalLineRow[];
}

export type LedgerSortId = 'date-desc' | 'date-asc' | 'reference-asc' | 'debit-desc';
