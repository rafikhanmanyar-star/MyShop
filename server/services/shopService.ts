import { getDatabaseService } from './databaseService.js';

export interface ShopSale {
  id?: string;
  branchId: string;
  terminalId: string;
  userId: string;
  customerId?: string;
  loyaltyMemberId?: string;
  saleNumber: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  totalPaid: number;
  changeDue: number;
  paymentMethod: string;
  paymentDetails: any;
  items: ShopSaleItem[];
}

export interface ShopSaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  discountAmount: number;
  subtotal: number;
}

export class ShopService {
  private db = getDatabaseService();

  // --- Branch Methods ---
  async getBranches(tenantId: string) {
    const branches = await this.db.query('SELECT * FROM shop_branches WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    if (branches.length === 0) {
      const branchId = await this.createBranch(tenantId, {
        name: 'Main Store',
        code: 'MAIN',
        type: 'Flagship',
        location: 'Head Office',
        timezone: 'GMT+5'
      });
      return this.db.query('SELECT * FROM shop_branches WHERE id = $1', [branchId]);
    }
    return branches;
  }

  async createBranch(tenantId: string, data: any) {
    return this.db.transaction(async (client) => {
      const managerName = data.managerName || data.manager || 'Branch Manager';
      const contactNo = data.contactNo || data.contact || '';
      const branchCode = data.code || `BR-${Date.now().toString().slice(-4)}`;

      const res = await client.query(`
        INSERT INTO shop_branches (
          tenant_id, name, code, type, region,
          manager_name, contact_no, timezone, open_time, close_time, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        tenantId, data.name, branchCode, data.type || 'Express', data.region || '',
        managerName, contactNo, data.timezone || 'GMT+5',
        data.openTime || '09:00', data.closeTime || '21:00', data.location || ''
      ]);

      const branchId = res[0].id;

      await client.query(`
        INSERT INTO shop_terminals (tenant_id, branch_id, name, code)
        VALUES ($1, $2, 'Main Terminal', $3)
      `, [tenantId, branchId, `T-${branchCode}-01`]);

      await client.query(`
        INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
        VALUES ($1, $2, $3, $4, $5)
      `, [branchId, tenantId, data.name, branchCode, data.location || 'Store']);

      return branchId;
    });
  }

  async updateBranch(tenantId: string, branchId: string, data: any) {
    return this.db.transaction(async (client) => {
      const managerName = data.managerName || data.manager;
      const contactNo = data.contactNo || data.contact;

      await client.query(`
        UPDATE shop_branches
        SET name = COALESCE($1, name), code = COALESCE($2, code), type = COALESCE($3, type),
            region = COALESCE($4, region), manager_name = COALESCE($5, manager_name),
            contact_no = COALESCE($6, contact_no), timezone = COALESCE($7, timezone),
            open_time = COALESCE($8, open_time), close_time = COALESCE($9, close_time),
            location = COALESCE($10, location), status = COALESCE($11, status), updated_at = NOW()
        WHERE id = $12 AND tenant_id = $13
      `, [
        data.name, data.code, data.type, data.region, managerName, contactNo,
        data.timezone, data.openTime, data.closeTime, data.location, data.status,
        branchId, tenantId
      ]);
      return branchId;
    });
  }

  // --- Warehouse Methods ---
  async getWarehouses(tenantId: string) {
    const warehouses = await this.db.query('SELECT * FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    const branches = await this.db.query('SELECT * FROM shop_branches WHERE tenant_id = $1', [tenantId]);

    if (warehouses.length < branches.length) {
      for (const branch of branches) {
        const hasWh = warehouses.some((w: any) => w.id === branch.id);
        if (!hasWh) {
          await this.db.query(`
            INSERT INTO shop_warehouses (id, tenant_id, name, code, location)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING
          `, [branch.id, tenantId, branch.name, branch.code, branch.location || 'Store']);
        }
      }
      return this.db.query('SELECT * FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    }

    if (warehouses.length === 0) {
      const defaultWarehouse = await this.db.query(`
        INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
        VALUES ($1, 'Main Warehouse', 'WH-MAIN', 'Head Office', TRUE) RETURNING *
      `, [tenantId]);
      return defaultWarehouse;
    }

    return warehouses;
  }

  async createWarehouse(tenantId: string, data: any) {
    const res = await this.db.query(`
      INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [tenantId, data.name, data.code || `WH-${Date.now().toString().slice(-4)}`, data.location || '', data.isActive ?? true]);
    return res[0].id;
  }

  // --- Terminal Methods ---
  async getTerminals(tenantId: string) {
    const res = await this.db.query('SELECT * FROM shop_terminals WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    if (res.length === 0) {
      const branches = await this.getBranches(tenantId);
      if (branches.length > 0) {
        await this.createTerminal(tenantId, { branchId: branches[0].id, name: 'Terminal 1', code: 'T-01', status: 'Online' });
        return this.db.query('SELECT * FROM shop_terminals WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
      }
    }
    return res;
  }

  async createTerminal(tenantId: string, data: any) {
    const res = await this.db.query(`
      INSERT INTO shop_terminals (tenant_id, branch_id, name, code, status, version, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [tenantId, data.branchId, data.name, data.code || `T-${Date.now().toString().slice(-4)}`,
      data.status || 'Offline', data.version || '1.0.0', data.ipAddress || '0.0.0.0']);
    return res[0].id;
  }

  async updateTerminal(tenantId: string, terminalId: string, data: any) {
    return this.db.query(`
      UPDATE shop_terminals
      SET name = COALESCE($1, name), status = COALESCE($2, status), last_sync = COALESCE($3, last_sync),
          ip_address = COALESCE($4, ip_address), health_score = COALESCE($5, health_score), updated_at = NOW()
      WHERE id = $6 AND tenant_id = $7
    `, [data.name, data.status, data.last_sync, data.ip_address, data.health_score, terminalId, tenantId]);
  }

  async deleteTerminal(tenantId: string, terminalId: string) {
    return this.db.query('DELETE FROM shop_terminals WHERE id = $1 AND tenant_id = $2', [terminalId, tenantId]);
  }

  // --- Product Methods ---
  async getProducts(tenantId: string) {
    return this.db.query('SELECT * FROM shop_products WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]);
  }

  async createProduct(tenantId: string, data: any) {
    return this.db.transaction(async (client) => {
      let categoryId = data.category_id || null;
      if (categoryId && categoryId.length < 32) {
        const catRes = await client.query(
          'SELECT id FROM categories WHERE tenant_id = $1 AND name ILIKE $2 LIMIT 1',
          [tenantId, categoryId]
        );
        categoryId = catRes.length > 0 ? catRes[0].id : null;
      }

      try {
        const sku = data.sku || `SKU-${Date.now()}`;

        // 1. Ensure product is created
        const res = await client.query(`
          INSERT INTO shop_products (
            tenant_id, name, sku, barcode, category_id, unit,
            cost_price, retail_price, tax_rate, reorder_point, image_url, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
        `, [
          tenantId, data.name, sku, data.barcode || null,
          categoryId, data.unit || 'pcs', data.cost_price || 0, data.retail_price || 0,
          data.tax_rate || 0, data.reorder_point || 10, data.image_url || null, true
        ]);
        const productId = res[0].id;

        // 2. Ensure default warehouse exists and link product to it
        let whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        let warehouseId;

        if (whRes.length === 0) {
          const newWh = await client.query(`
            INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
            VALUES ($1, 'Main Warehouse', 'MAIN', 'Default Location', TRUE) RETURNING id
          `, [tenantId]);
          warehouseId = newWh[0].id;
        } else {
          warehouseId = whRes[0].id;
        }

        // 3. Create initial inventory record
        await client.query(`
          INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING
        `, [tenantId, productId, warehouseId]);

        return productId;
      } catch (err: any) {
        console.error('❌ [ShopService] createProduct failed:', err);
        if (err.code === '23505') throw new Error(`SKU already exists.`);
        throw new Error(err.message || 'Unknown database error');
      }
    });
  }

  async updateProduct(tenantId: string, productId: string, data: any) {
    return this.db.transaction(async (client) => {
      try {
        await client.query(`
          UPDATE shop_products
          SET name = $1, sku = $2, barcode = $3, category_id = $4, unit = $5,
              cost_price = $6, retail_price = $7, tax_rate = $8, reorder_point = $9,
              image_url = $10, is_active = $11, updated_at = NOW()
          WHERE id = $12 AND tenant_id = $13
        `, [
          data.name, data.sku, data.barcode, data.category_id || data.categoryId,
          data.unit, data.cost_price || data.cost, data.retail_price || data.price,
          data.tax_rate || data.taxRate, data.reorder_point || data.reorderPoint,
          data.image_url, data.is_active !== undefined ? data.is_active : true, productId, tenantId
        ]);
        return { success: true };
      } catch (err: any) {
        throw new Error(`Failed to update product: ${err.message}`);
      }
    });
  }

  // --- Inventory Methods ---
  async getInventory(tenantId: string) {
    return this.db.query(`
      SELECT i.*, p.name as product_name, p.sku, p.retail_price, w.name as warehouse_name
      FROM shop_inventory i
      JOIN shop_products p ON i.product_id = p.id AND p.tenant_id = $1
      JOIN shop_warehouses w ON i.warehouse_id = w.id AND w.tenant_id = $1
      WHERE i.tenant_id = $1
    `, [tenantId]);
  }

  async getInventoryMovements(tenantId: string, productId?: string) {
    let query = `
      SELECT m.*, p.name as product_name, p.sku, w.name as warehouse_name
      FROM shop_inventory_movements m
      JOIN shop_products p ON m.product_id = p.id AND p.tenant_id = $1
      JOIN shop_warehouses w ON m.warehouse_id = w.id AND w.tenant_id = $1
      WHERE m.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (productId) {
      query += ` AND m.product_id = $2`;
      params.push(productId);
    }
    query += ` ORDER BY m.created_at DESC`;
    return this.db.query(query, params);
  }

  async adjustInventory(tenantId: string, data: {
    productId: string; warehouseId: string; quantity: number;
    type: string; referenceId?: string; reason?: string; userId: string;
  }) {
    return this.db.transaction(async (client) => {
      const updateRes = await client.query(`
        INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (tenant_id, product_id, warehouse_id)
        DO UPDATE SET quantity_on_hand = shop_inventory.quantity_on_hand + $4, updated_at = NOW()
        RETURNING *
      `, [tenantId, data.productId, data.warehouseId, data.quantity]);

      await client.query(`
        INSERT INTO shop_inventory_movements (tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [tenantId, data.productId, data.warehouseId, data.type, data.quantity,
        data.referenceId || `adj-${Date.now()}`, data.userId, data.reason]);

      return updateRes[0];
    });
  }

  // --- Sales Methods ---
  async createSale(tenantId: string, saleData: ShopSale) {
    return this.db.transaction(async (client) => {
      const saleRes = await client.query(`
        INSERT INTO shop_sales (
          tenant_id, branch_id, terminal_id, user_id, customer_id,
          loyalty_member_id, sale_number, subtotal, tax_total,
          discount_total, grand_total, total_paid, change_due,
          payment_method, payment_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [
        tenantId, saleData.branchId, saleData.terminalId, saleData.userId,
        saleData.customerId, saleData.loyaltyMemberId, saleData.saleNumber,
        saleData.subtotal, saleData.taxTotal, saleData.discountTotal,
        saleData.grandTotal, saleData.totalPaid, saleData.changeDue,
        saleData.paymentMethod, JSON.stringify(saleData.paymentDetails)
      ]);

      const saleId = saleRes[0].id;

      for (const item of saleData.items) {
        await client.query(`
          INSERT INTO shop_sale_items (tenant_id, sale_id, product_id, quantity, unit_price, tax_amount, discount_amount, subtotal)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [tenantId, saleId, item.productId, item.quantity, item.unitPrice, item.taxAmount, item.discountAmount, item.subtotal]);

        const whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
        if (whRes.length > 0) {
          const warehouseId = whRes[0].id;
          await client.query(`
            UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1
            WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4
          `, [item.quantity, tenantId, item.productId, warehouseId]);

          await client.query(`
            INSERT INTO shop_inventory_movements (tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id)
            VALUES ($1, $2, $3, 'Sale', $4, $5, $6)
          `, [tenantId, item.productId, warehouseId, -item.quantity, saleId, saleData.userId]);
        }
      }

      if (saleData.loyaltyMemberId) {
        const pointsEarned = Math.floor(saleData.grandTotal / 100);
        await client.query(`
          UPDATE shop_loyalty_members
          SET points_balance = points_balance + $1, total_spend = total_spend + $2, visit_count = visit_count + 1
          WHERE id = $3
        `, [pointsEarned, saleData.grandTotal, saleData.loyaltyMemberId]);
        await client.query(`UPDATE shop_sales SET points_earned = $1 WHERE id = $2`, [pointsEarned, saleId]);
      }

      if (saleData.paymentDetails && Array.isArray(saleData.paymentDetails)) {
        for (const payment of saleData.paymentDetails) {
          if (payment.bankAccountId) {
            await client.query(`
              UPDATE shop_bank_accounts 
              SET balance = COALESCE(balance, 0) + $1, updated_at = NOW() 
              WHERE id = $2 AND tenant_id = $3
            `, [payment.amount, payment.bankAccountId, tenantId]);
          }
        }
      }

      await this.postSaleToAccounting(client, saleId, tenantId, saleData);

      // --- UPDATE BUDGET ACTUALS (if customer linked) ---
      if (saleData.customerId) {
        try {
          const { getBudgetService } = await import('./budgetService.js');
          await getBudgetService().updateActualsFromOrder(client, tenantId, saleData.customerId, saleData.items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            subtotal: i.subtotal
          })));
        } catch (budgetErr) {
          console.error('⚠️ Failed to update POS budget actuals:', budgetErr);
        }
      }

      return saleId;
    });
  }

  // Double-entry accounting for Sales
  private async postSaleToAccounting(client: any, saleId: string, tenantId: string, saleData: ShopSale) {
    const journalIdResult = await client.query(`
      INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
      VALUES ($1, NOW(), $2, $3, 'POS', $4, 'Posted')
      RETURNING id
    `, [tenantId, saleData.saleNumber, `Sale ${saleData.saleNumber}`, saleId]);

    if (journalIdResult.length === 0) return; // Silent return for missing tables if not migrated yet
    const journalId = journalIdResult[0].id;

    // Helper to get or create account
    const getAccount = async (name: string, type: string, code: string) => {
      let accRes = await client.query('SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 LIMIT 1', [tenantId, code]);
      if (accRes.length === 0) {
        accRes = await client.query(
          'INSERT INTO accounts (tenant_id, name, code, type, balance) VALUES ($1, $2, $3, $4, 0) RETURNING id',
          [tenantId, name, code, type]
        );
      }
      return accRes[0].id;
    };

    const isCredit = saleData.paymentMethod === 'Credit';

    // Revenue Ledger (Credit)
    const revenueAcc = await getAccount('Sales Revenue', 'Income', 'INC-400');
    await client.query(
      'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
      [tenantId, journalId, revenueAcc, saleData.grandTotal]
    );

    // Asset/Cash Ledger (Debit)
    if (isCredit) {
      if (!saleData.customerId) throw new Error('Customer required for credit sale');
      const arAcc = await getAccount('Accounts Receivable', 'Asset', 'AST-120');
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, arAcc, saleData.grandTotal]
      );
      // Update customer balance
      await client.query(`
        INSERT INTO customer_balance (tenant_id, customer_id, balance) VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, customer_id) DO UPDATE SET balance = customer_balance.balance + $3, updated_at = NOW()
      `, [tenantId, saleData.customerId, saleData.grandTotal]);
    } else {
      const cashAcc = await getAccount('Cash', 'Asset', 'AST-100');
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, cashAcc, saleData.grandTotal]
      );
    }

    // COGS vs Inventory (Only if items exist with cost prices)
    // To properly calculate COGS, we sum up max(cost_price, 0) * qty
    let totalCogs = 0;
    for (const item of saleData.items) {
      const prodRes = await client.query('SELECT cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2 LIMIT 1', [item.productId, tenantId]);
      if (prodRes.length > 0 && prodRes[0].cost_price) {
        totalCogs += (Number(prodRes[0].cost_price) * item.quantity);
      }
    }

    if (totalCogs > 0) {
      const cogsAcc = await getAccount('Cost of Goods Sold', 'Expense', 'EXP-500');
      const invAssetAcc = await getAccount('Inventory Asset', 'Asset', 'AST-110');

      // Debit COGS
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, cogsAcc, totalCogs]
      );
      // Credit Inventory
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
        [tenantId, journalId, invAssetAcc, totalCogs]
      );
    }

    // Invalidate report aggregates
    await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
  }

  async getSales(tenantId: string) {
    return this.db.query(`
      SELECT 
        s.id, s.tenant_id as "tenantId", s.branch_id as "branchId", s.terminal_id as "terminalId", 
        s.user_id as "userId", s.customer_id as "customerId", s.loyalty_member_id as "loyaltyMemberId", 
        s.sale_number as "saleNumber", s.subtotal, s.tax_total as "taxTotal", 
        s.discount_total as "discountTotal", s.grand_total as "grandTotal", 
        s.total_paid as "totalPaid", s.change_due as "changeDue", 
        s.payment_method as "paymentMethod", s.payment_details as "paymentDetails", 
        s.status, s.points_earned as "pointsEarned", s.points_redeemed as "pointsRedeemed", 
        s.created_at as "createdAt", s.updated_at as "updatedAt",
        c.name as "customerName", b.name as "branchName", 'POS' as source,
        COALESCE((
          SELECT json_agg(json_build_object(
            'productId', si.product_id,
            'name', COALESCE(p.name, 'Unknown Product'),
            'quantity', si.quantity,
            'unitPrice', si.unit_price,
            'taxAmount', si.tax_amount,
            'discountAmount', si.discount_amount,
            'subtotal', si.subtotal
          ))
          FROM shop_sale_items si
          LEFT JOIN shop_products p ON si.product_id = p.id
          WHERE si.sale_id = s.id
        ), '[]'::json) as items
      FROM shop_sales s
      LEFT JOIN contacts c ON s.customer_id = c.id AND c.tenant_id = $1
      LEFT JOIN shop_branches b ON s.branch_id = b.id AND b.tenant_id = $1
      WHERE s.tenant_id = $1
      
      UNION ALL
      
      SELECT 
        o.id, o.tenant_id as "tenantId", o.branch_id as "branchId", NULL as "terminalId", 
        NULL as "userId", o.customer_id as "customerId", NULL as "loyaltyMemberId", 
        o.order_number as "saleNumber", o.subtotal, o.tax_total as "taxTotal", 
        o.discount_total as "discountTotal", o.grand_total as "grandTotal", 
        o.grand_total as "totalPaid", 0 as "changeDue", 
        o.payment_method as "paymentMethod", NULL as "paymentDetails", 
        o.status, 0 as "pointsEarned", 0 as "pointsRedeemed", 
        o.created_at as "createdAt", o.updated_at as "updatedAt",
        mc.name as "customerName", b.name as "branchName", 'Mobile' as source,
        COALESCE((
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'name', oi.product_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'taxAmount', oi.tax_amount,
            'discountAmount', oi.discount_amount,
            'subtotal', oi.subtotal
          ))
          FROM mobile_order_items oi
          WHERE oi.order_id = o.id
        ), '[]'::json) as items
      FROM mobile_orders o
      LEFT JOIN mobile_customers mc ON o.customer_id = mc.id
      LEFT JOIN shop_branches b ON o.branch_id = b.id AND b.tenant_id = $1
      WHERE o.tenant_id = $1 AND o.status = 'Delivered'
      ORDER BY "createdAt" DESC
    `, [tenantId]);
  }

  // --- Loyalty Methods ---
  async getLoyaltyMembers(tenantId: string) {
    return this.db.query(`
      SELECT m.*, c.name as customer_name, c.contact_no, c.address as email
      FROM shop_loyalty_members m
      JOIN contacts c ON m.customer_id = c.id AND c.tenant_id = $1
      WHERE m.tenant_id = $1
    `, [tenantId]);
  }

  async createLoyaltyMember(tenantId: string, data: any) {
    return this.db.transaction(async (client) => {
      let customerId = data.customerId;

      if (!customerId && data.phone) {
        const existing = await client.query(
          'SELECT id FROM contacts WHERE tenant_id = $1 AND contact_no = $2 LIMIT 1',
          [tenantId, data.phone]
        );
        if (existing.length > 0) customerId = existing[0].id;
      }

      if (!customerId) {
        const newContactId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newContact = await client.query(`
          INSERT INTO contacts (id, tenant_id, name, type, contact_no, address)
          VALUES ($1, $2, $3, 'Customer', $4, $5) RETURNING id
        `, [newContactId, tenantId, data.name, data.phone, data.email]);
        customerId = newContact[0].id;
      }

      const res = await client.query(`
        INSERT INTO shop_loyalty_members (tenant_id, customer_id, card_number, tier, status)
        VALUES ($1, $2, $3, 'Silver', 'Active') RETURNING id
      `, [tenantId, customerId, data.cardNumber || `L-${Date.now()}`]);
      return res[0].id;
    });
  }

  async updateLoyaltyMember(tenantId: string, memberId: string, data: any) {
    return this.db.query(`
      UPDATE shop_loyalty_members
      SET card_number = COALESCE($1, card_number), tier = COALESCE($2, tier),
          status = COALESCE($3, status), updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5 RETURNING *
    `, [data.cardNumber, data.tier, data.status, memberId, tenantId]);
  }

  async deleteLoyaltyMember(tenantId: string, memberId: string) {
    return this.db.query('DELETE FROM shop_loyalty_members WHERE id = $1 AND tenant_id = $2', [memberId, tenantId]);
  }

  // --- Policy Methods ---
  async getPolicies(tenantId: string) {
    const res = await this.db.query('SELECT * FROM shop_policies WHERE tenant_id = $1', [tenantId]);
    if (res.length === 0) {
      const defaultRes = await this.db.query('INSERT INTO shop_policies (tenant_id) VALUES ($1) RETURNING *', [tenantId]);
      return defaultRes[0];
    }
    return res[0];
  }

  async updatePolicies(tenantId: string, data: any) {
    const res = await this.db.query(`
      INSERT INTO shop_policies (
        tenant_id, allow_negative_stock, universal_pricing,
        tax_inclusive, default_tax_rate, require_manager_approval,
        loyalty_redemption_ratio, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        allow_negative_stock = EXCLUDED.allow_negative_stock,
        universal_pricing = EXCLUDED.universal_pricing,
        tax_inclusive = EXCLUDED.tax_inclusive,
        default_tax_rate = EXCLUDED.default_tax_rate,
        require_manager_approval = EXCLUDED.require_manager_approval,
        loyalty_redemption_ratio = EXCLUDED.loyalty_redemption_ratio,
        updated_at = NOW()
      RETURNING *
    `, [tenantId, data.allowNegativeStock, data.universalPricing, data.taxInclusive,
      data.defaultTaxRate, data.requireManagerApproval, data.loyaltyRedemptionRatio]);
    return res[0];
  }

  // --- Category Methods ---
  async getShopCategories(tenantId: string) {
    return this.db.query(
      `SELECT id, name, type, created_at FROM categories
       WHERE tenant_id = $1 AND type = 'product' AND deleted_at IS NULL ORDER BY name`,
      [tenantId]
    );
  }

  async createShopCategory(tenantId: string, data: { name: string }) {
    const id = `shop_cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await this.db.query(
      `INSERT INTO categories (id, tenant_id, name, type, created_at, updated_at)
       VALUES ($1, $2, $3, 'product', NOW(), NOW())`,
      [id, tenantId, data.name]
    );
    return id;
  }

  async updateShopCategory(tenantId: string, categoryId: string, data: { name: string }) {
    await this.db.query(
      `UPDATE categories SET name = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND type = 'product'`,
      [data.name, categoryId, tenantId]
    );
  }

  async deleteShopCategory(tenantId: string, categoryId: string) {
    await this.db.query(
      `UPDATE shop_products SET category_id = NULL WHERE tenant_id = $1 AND category_id = $2`,
      [tenantId, categoryId]
    );
    await this.db.query(
      `UPDATE categories SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND type = 'product'`,
      [categoryId, tenantId]
    );
  }

  // --- Bank Accounts (Chart of Accounts for POS) ---
  async getBankAccounts(tenantId: string, activeOnly = true) {
    const clause = activeOnly ? 'AND is_active = TRUE' : '';
    return this.db.query(
      `SELECT id, name, code, account_type, currency, balance, is_active, created_at, updated_at
       FROM shop_bank_accounts WHERE tenant_id = $1 ${clause} ORDER BY name`,
      [tenantId]
    );
  }

  async createBankAccount(tenantId: string, data: { name: string; code?: string; account_type?: string; currency?: string }) {
    const res = await this.db.query(
      `INSERT INTO shop_bank_accounts (tenant_id, name, code, account_type, currency)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, data.name, data.code || null, data.account_type || 'Bank', data.currency || 'BDT']
    );
    return res[0].id;
  }

  async updateBankAccount(tenantId: string, id: string, data: { name?: string; code?: string; is_active?: boolean }) {
    await this.db.query(
      `UPDATE shop_bank_accounts SET name = COALESCE($1, name), code = COALESCE($2, code),
        is_active = COALESCE($3, is_active), updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [data.name, data.code, data.is_active, id, tenantId]
    );
  }

  async deleteBankAccount(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE shop_bank_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  // --- Vendors (for Procurement) ---
  async getVendors(tenantId: string) {
    return this.db.query(
      `SELECT id, name, company_name, contact_no, email, address, description, is_active, created_at, updated_at
       FROM shop_vendors WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
  }

  async createVendor(tenantId: string, data: { name: string; company_name?: string; contact_no?: string; email?: string; address?: string; description?: string }) {
    const res = await this.db.query(
      `INSERT INTO shop_vendors (tenant_id, name, company_name, contact_no, email, address, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, company_name, contact_no, email, address, description, is_active, created_at, updated_at`,
      [
        tenantId,
        data.name,
        data.company_name || null,
        data.contact_no || null,
        data.email || null,
        data.address || null,
        data.description || null
      ]
    );
    return res[0];
  }

  async updateVendor(tenantId: string, id: string, data: { name?: string; company_name?: string; contact_no?: string; email?: string; address?: string; description?: string; is_active?: boolean }) {
    await this.db.query(
      `UPDATE shop_vendors SET
        name = COALESCE($1, name), company_name = COALESCE($2, company_name),
        contact_no = COALESCE($3, contact_no), email = COALESCE($4, email),
        address = COALESCE($5, address), description = COALESCE($6, description),
        is_active = COALESCE($7, is_active), updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9`,
      [data.name, data.company_name, data.contact_no, data.email, data.address, data.description, data.is_active, id, tenantId]
    );
  }

  async deleteVendor(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE shop_vendors SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  // --- User Management ---
  async getUsers(tenantId: string) {
    return this.db.query(
      `SELECT id, username, name, role, email, is_active, login_status, created_at
       FROM users WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
  }

  async createUser(tenantId: string, data: any) {
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash(data.password, 10);

    await this.db.execute(
      `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
      [userId, tenantId, data.username, data.name, data.role, hashedPassword, data.email]
    );
    return userId;
  }

  async updateUser(tenantId: string, userId: string, data: any) {
    let hashedPassword = undefined;
    if (data.password) {
      const bcrypt = await import('bcryptjs');
      hashedPassword = await bcrypt.default.hash(data.password, 10);
    }

    await this.db.execute(
      `UPDATE users
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           email = COALESCE($3, email),
           is_active = COALESCE($4, is_active),
           password = COALESCE($5, password),
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [data.name, data.role, data.email, data.is_active, hashedPassword, userId, tenantId]
    );
  }

  async deleteUser(tenantId: string, userId: string) {
    await this.db.execute(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }
}

let shopServiceInstance: ShopService | null = null;
export function getShopService(): ShopService {
  if (!shopServiceInstance) {
    shopServiceInstance = new ShopService();
  }
  return shopServiceInstance;
}
