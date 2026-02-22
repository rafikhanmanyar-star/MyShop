import assert from 'node:assert';
import { getShopService } from './services/shopService.js';

async function runTests() {
    console.log('🧪 Starting Accounting & Sale Validation Tests...');

    // Mock DB Client to capture queries for validation
    const queries: any[] = [];
    const mockClient = {
        query: async (text: string, params: any[]) => {
            queries.push({ text, params });

            // Mock returning ID for journal entries
            if (text.includes('INSERT INTO journal_entries')) {
                return [{ id: 'mock-journal-123' }];
            }

            // Mock returning ID for accounts
            if (text.includes('SELECT id FROM accounts')) {
                return []; // Always simulate missing account to trigger INSERT
            }
            if (text.includes('INSERT INTO accounts')) {
                return [{ id: 'mock-acc-xyz' }];
            }

            // Mock Product cost price for COGS calculation
            if (text.includes('SELECT cost_price FROM shop_products')) {
                return [{ cost_price: 50.00 }]; // mock unit cost price
            }

            return [];
        }
    };

    const getShopServicePrivateRef = (getShopService() as any);

    // Test 1: CASH SALE
    console.log('--- Checking Cash Sale ---');
    queries.length = 0; // Clear mock
    await getShopServicePrivateRef.postSaleToAccounting(
        mockClient,
        'mock-sale-1',
        'tenant-1',
        {
            saleNumber: 'SALE-1001',
            paymentMethod: 'Cash',
            grandTotal: 500,
            items: [{ productId: 'prod-1', quantity: 2 }]
        }
    );

    // Verify Cash account gets updated correctly
    const hasCashLedgerEntry = queries.some(q =>
        q.text.includes('INSERT INTO ledger_entries') &&
        q.params[3] === 500 // debit amount parameter for Cash
    );
    assert(hasCashLedgerEntry, '❌ Cash ledger entry debit missing');

    // Verify Revenue account
    const hasRevenueEntry = queries.some(q =>
        q.text.includes('INSERT INTO ledger_entries') &&
        q.params[3] === 500 // credit amount parameter for Revenue is params[3]
    );
    assert(hasRevenueEntry, '❌ Revenue ledger entry credit missing');


    // Test 2: CREDIT SALE (Checking Customer Balance)
    console.log('--- Checking Credit Sale ---');
    queries.length = 0;
    await getShopServicePrivateRef.postSaleToAccounting(
        mockClient,
        'mock-sale-2',
        'tenant-1',
        {
            saleNumber: 'SALE-1002',
            paymentMethod: 'Credit',
            customerId: 'cust-123',
            grandTotal: 1000,
            items: [{ productId: 'prod-1', quantity: 10 }] // COGS: 10 * 50 = 500
        }
    );

    // Verify AR Entry (Debit)
    const hasAREntry = queries.some(q =>
        q.text.includes('INSERT INTO ledger_entries') &&
        q.params[3] === 1000 // debit amount
    );
    assert(hasAREntry, '❌ Account Receivable ledger entry missing');

    // Verify Customer Balance Table Updates
    const hasCustomerBalanceUpdate = queries.some(q =>
        q.text.includes('INSERT INTO customer_balance') &&
        q.params.includes('cust-123') &&
        q.params.includes(1000)
    );
    assert(hasCustomerBalanceUpdate, '❌ Customer balance update missing');

    // Verify COGS & Inventory Asset
    // Verify COGS entry
    const hasCogsEntry = queries.some(q =>
        q.text.includes('INSERT INTO ledger_entries') &&
        q.params[3] === 500 // Debit COGS
    );
    // Verify Inventory Asset
    const hasInvAssetEntry = queries.some(q =>
        q.text.includes('INSERT INTO ledger_entries') &&
        q.params[3] === 500 // Credit Inventory
    );
    assert(hasCogsEntry, '❌ COGS entry missing');
    assert(hasInvAssetEntry, '❌ Inventory Asset entry missing');

    // Verify Report Validation Flush
    const hasReportFlush = queries.some(q =>
        q.text.includes('DELETE FROM report_aggregates')
    );
    assert(hasReportFlush, '❌ Cache validation flush missing');

    console.log('✅ All Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
