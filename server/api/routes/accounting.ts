import express from 'express';
import { getAccountingService } from '../../services/accountingService.js';
import { getCoaSeedService } from '../../services/coaSeedService.js';
import { getDailyReportService } from '../../services/dailyReportService.js';
import { getDatabaseService } from '../../services/databaseService.js';
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

// --- Create New Account (Chart of Accounts) ---
router.post('/accounts', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const { name, code, type, description, isActive } = req.body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        if (!code || code.trim() === '') {
            return res.status(400).json({ error: 'Account code is required' });
        }
        const account = await getAccountingService().createAccount(req.tenantId, {
            name: name.trim(), code: code.trim(), type, description, isActive
        });
        res.status(201).json(account);
    } catch (error: any) {
        const status = error.statusCode || 500;
        if (status !== 500) {
            return res.status(status).json({ error: error.message });
        }
        console.error('❌ Error creating account:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Update Account (Chart of Accounts) ---
router.put('/accounts/:id', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const { id } = req.params;
        const { name, code, type, description, isActive } = req.body;
        const account = await getAccountingService().updateAccount(req.tenantId, id, {
            name, code, type, description, isActive
        });
        res.json(account);
    } catch (error: any) {
        const status = error.statusCode || 500;
        if (status !== 500) {
            return res.status(status).json({ error: error.message });
        }
        console.error('❌ Error updating account:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Delete Account (Chart of Accounts) ---
router.delete('/accounts/:id', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const { id } = req.params;
        await getAccountingService().deleteAccount(req.tenantId, id);
        res.json({ success: true });
    } catch (error: any) {
        const status = error.statusCode || 500;
        if (status !== 500) {
            return res.status(status).json({ error: error.message });
        }
        console.error('❌ Error deleting account:', error);
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

// --- Update Journal Entry (admin only; syncs accounts and report aggregates) ---
router.put('/journal-entries/:id', checkRole(['admin']), async (req: any, res) => {
    try {
        const { id } = req.params;
        const result = await getAccountingService().updateJournalEntry(req.tenantId, id, req.body);
        res.json(result);
    } catch (error: any) {
        const status = error.statusCode || 500;
        if (status !== 500) {
            return res.status(status).json({ error: error.message });
        }
        console.error('❌ Error updating journal entry:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Delete Journal Entry (admin only; syncs accounts and report aggregates) ---
router.delete('/journal-entries/:id', checkRole(['admin']), async (req: any, res) => {
    try {
        const { id } = req.params;
        await getAccountingService().deleteJournalEntry(req.tenantId, id);
        res.json({ success: true });
    } catch (error: any) {
        const status = error.statusCode || 500;
        if (status !== 500) {
            return res.status(status).json({ error: error.message });
        }
        console.error('❌ Error deleting journal entry:', error);
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

// --- Seed default enterprise Chart of Accounts (idempotent; for new or existing tenants) ---
router.post('/seed-coa', checkRole(['admin']), async (req: any, res) => {
    try {
        const { inserted, skipped } = await getCoaSeedService().seedDefaultChartOfAccounts(req.tenantId);
        res.json({ success: true, inserted, skipped, message: `Chart of Accounts: ${inserted} accounts added, ${skipped} already present.` });
    } catch (error: any) {
        console.error('❌ Error seeding CoA:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Clear all transactions (admin only; keeps settings, accounts, users, vendors) ---
router.post('/clear-transactions', checkRole(['admin']), async (req: any, res) => {
    try {
        await getAccountingService().clearAllTransactions(req.tenantId);
        res.json({ success: true, message: 'All transactions have been cleared.' });
    } catch (error: any) {
        console.error('❌ Error clearing transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Daily report (POS + mobile + inventory + expenses + products) — real-time via SSE /reports/daily/stream ---
router.get('/reports/daily/stream', checkRole(['admin', 'accountant']), async (req: any, res) => {
    const tenantId = req.tenantId;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', tenantId })}\n\n`);
    const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);
    const db = getDatabaseService();
    const pool = db.getPool();
    let pgClient: any = null;
    if (pool) {
        try {
            pgClient = await pool.connect();
            await pgClient.query('LISTEN daily_report_updated');
            pgClient.on('notification', (msg: any) => {
                try {
                    const payload = JSON.parse(msg.payload);
                    if (payload.tenantId === tenantId) {
                        res.write(`data: ${JSON.stringify({ type: 'daily_report_updated', ...payload })}\n\n`);
                    }
                } catch (err) {
                    console.error('SSE daily_report parse error:', err);
                }
            });
        } catch (err) {
            console.error('SSE daily_report LISTEN error:', err);
        }
    }
    req.on('close', () => {
        clearInterval(heartbeat);
        if (pgClient) {
            pgClient.query('UNLISTEN daily_report_updated').catch(() => { });
            pgClient.release();
        }
    });
});

router.get('/reports/daily/summary', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const raw = (req.query.branchId as string) || '';
        const branchId = raw && raw !== 'all' ? raw : null;
        const data = await getDailyReportService().getSummary(req.tenantId, date, branchId);
        res.json(data);
    } catch (error: any) {
        console.error('❌ Error daily report summary:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/daily/inventory-out', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const raw = (req.query.branchId as string) || '';
        const branchId = raw && raw !== 'all' ? raw : null;
        const rows = await getDailyReportService().getInventoryOutDetail(req.tenantId, date, branchId);
        res.json({ rows });
    } catch (error: any) {
        console.error('❌ Error daily report inventory-out:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/daily/inventory-in', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const raw = (req.query.branchId as string) || '';
        const branchId = raw && raw !== 'all' ? raw : null;
        const rows = await getDailyReportService().getInventoryInDetail(req.tenantId, date, branchId);
        res.json({ rows });
    } catch (error: any) {
        console.error('❌ Error daily report inventory-in:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/daily/expenses', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const raw = (req.query.branchId as string) || '';
        const branchId = raw && raw !== 'all' ? raw : null;
        const rows = await getDailyReportService().getExpensesDetail(req.tenantId, date, branchId);
        res.json({ rows });
    } catch (error: any) {
        console.error('❌ Error daily report expenses:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/daily/products-created', checkRole(['admin', 'accountant']), async (req: any, res) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const rows = await getDailyReportService().getProductsCreated(req.tenantId, date);
        res.json({ rows });
    } catch (error: any) {
        console.error('❌ Error daily report products:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
