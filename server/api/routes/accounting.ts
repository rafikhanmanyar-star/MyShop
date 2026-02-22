import express from 'express';
import { getAccountingService } from '../../services/accountingService.js';
import { checkRole } from '../../middleware/roleMiddleware.js';

const router = express.Router();

console.log('✅ Accounting router initialized');

// --- Accounts (Chart of Accounts with computed balances) ---
router.get('/accounts', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const accounts = await getAccountingService().getAccountsWithBalances(req.tenantId);
        res.json(accounts);
    } catch (error: any) {
        console.error('❌ Error fetching accounting accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Journal Entries with Ledger Lines ---
router.get('/journal-entries', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 200;
        const entries = await getAccountingService().getJournalEntries(req.tenantId, limit);
        res.json(entries);
    } catch (error: any) {
        console.error('❌ Error fetching journal entries:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Post Manual Journal Entry ---
router.post('/journal-entries', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const result = await getAccountingService().postManualJournalEntry(req.tenantId, req.body);
        res.status(201).json(result);
    } catch (error: any) {
        console.error('❌ Error posting journal entry:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Financial Summary (P&L, Balance Sheet metrics) ---
router.get('/summary', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const summary = await getAccountingService().getFinancialSummary(req.tenantId);
        res.json(summary);
    } catch (error: any) {
        console.error('❌ Error fetching financial summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Bank Balances ---
router.get('/bank-balances', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const balances = await getAccountingService().getBankBalances(req.tenantId);
        res.json(balances);
    } catch (error: any) {
        console.error('❌ Error fetching bank balances:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Sales by Source (POS vs Mobile) ---
router.get('/sales-by-source', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const data = await getAccountingService().getSalesBySource(req.tenantId);
        res.json(data);
    } catch (error: any) {
        console.error('❌ Error fetching sales by source:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Daily Revenue Trend ---
router.get('/daily-trend', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const trend = await getAccountingService().getDailyRevenueTrend(req.tenantId, days);
        res.json(trend);
    } catch (error: any) {
        console.error('❌ Error fetching daily trend:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Category Performance ---
router.get('/category-performance', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const data = await getAccountingService().getCategoryPerformance(req.tenantId);
        res.json(data);
    } catch (error: any) {
        console.error('❌ Error fetching category performance:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Recent Transactions ---
router.get('/transactions', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const data = await getAccountingService().getRecentTransactions(req.tenantId, limit);
        res.json(data);
    } catch (error: any) {
        console.error('❌ Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
