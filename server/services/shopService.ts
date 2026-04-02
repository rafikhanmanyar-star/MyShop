import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';
import { fetchUnitCostForProduct, resolveUnitCostFromProductRow } from '../utils/productUnitCost.js';

/** Strip absolute URLs (e.g. http://localhost:3000/uploads/...) to relative paths for DB storage. */
function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try { return new URL(trimmed).pathname; } catch { return trimmed; }
  }
  return trimmed;
}

export interface ShopSale {
  id?: string;
  branchId?: string | null;
  terminalId?: string | null;
  userId?: string | null;
  shiftId?: string | null;
  customerId?: string | null;
  loyaltyMemberId?: string | null;
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
  /** Set server-side at sale time; used for COGS so later product cost edits do not change posted amounts. */
  unitCostAtSale?: number;
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
      return this.db.query('SELECT * FROM shop_branches WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
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
          manager_name, contact_no, timezone, open_time, close_time, location, slug
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        tenantId, data.name, branchCode, data.type || 'Express', data.region || '',
        managerName, contactNo, data.timezone || 'GMT+5',
        data.openTime || '09:00', data.closeTime || '21:00', data.location || '',
        data.slug || null
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
      const slugVal = data.slug !== undefined ? (data.slug === '' ? null : data.slug) : undefined;

      if (slugVal !== undefined) {
        const slugToUse = slugVal === null ? null : String(slugVal).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 50) || null;
        if (slugToUse && !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slugToUse)) {
          throw new Error('Invalid slug format. Use lowercase letters, numbers, and hyphens (3-50 chars).');
        }
        const existing = await client.query(
          'SELECT id, tenant_id FROM shop_branches WHERE slug = $1 AND id != $2',
          [slugToUse, branchId]
        );
        if (existing.length > 0) {
          const other = existing[0];
          if (other.tenant_id === tenantId) {
            // Same tenant: transfer slug from the other branch to this one (so this branch gets the URL)
            await client.query(
              'UPDATE shop_branches SET slug = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
              [other.id, tenantId]
            );
          } else {
            throw new Error('This shop URL is already taken by another store. Please choose another.');
          }
        }
        await client.query(
          'UPDATE shop_branches SET slug = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          [slugToUse, branchId, tenantId]
        );
      }

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

  /** Resolve branch by globally unique slug (for mobile QR URL). */
  async getBranchBySlug(slug: string): Promise<{ id: string; tenant_id: string; name: string; code: string; location: string; slug: string | null } | null> {
    const rows = await this.db.query(
      'SELECT id, tenant_id, name, code, location, slug FROM shop_branches WHERE slug = $1',
      [slug]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /** Check if a branch can be deleted: no transactions, no linked terminals, no inventory in its warehouse. */
  async getBranchDeleteStatus(tenantId: string, branchId: string): Promise<{
    canDelete: boolean;
    hasTransactions: boolean;
    terminalCount: number;
    hasInventory: boolean;
    message?: string;
  }> {
    const [salesCount] = await this.db.query(
      'SELECT COUNT(*)::int AS c FROM shop_sales WHERE tenant_id = $1 AND branch_id = $2',
      [tenantId, branchId]
    );
    const [mobileCount] = await this.db.query(
      'SELECT COUNT(*)::int AS c FROM mobile_orders WHERE tenant_id = $1 AND branch_id = $2',
      [tenantId, branchId]
    );
    const hasTransactions = (salesCount?.c ?? 0) > 0 || (mobileCount?.c ?? 0) > 0;

    const terminals = await this.db.query(
      'SELECT id FROM shop_terminals WHERE tenant_id = $1 AND branch_id = $2',
      [tenantId, branchId]
    );
    const terminalCount = terminals.length;

    // Branch's warehouse uses id = branchId when created with the branch
    const [inv] = await this.db.query(
      `SELECT 1 FROM shop_inventory i
       JOIN shop_warehouses w ON i.warehouse_id = w.id AND w.tenant_id = $1
       WHERE i.tenant_id = $1 AND i.warehouse_id = $2 AND (i.quantity_on_hand > 0 OR i.quantity_reserved > 0)
       LIMIT 1`,
      [tenantId, branchId]
    );
    const hasInventory = !!inv;

    const canDelete = !hasTransactions && terminalCount === 0 && !hasInventory;
    let message: string | undefined;
    if (hasTransactions) message = 'This branch has sales or orders. Branches with transactions cannot be deleted.';
    else if (terminalCount > 0) message = `Delete the ${terminalCount} terminal(s) linked to this branch first.`;
    else if (hasInventory) message = 'Move or clear all inventory in this branch\'s warehouse before deleting the branch.';

    return { canDelete, hasTransactions, terminalCount, hasInventory, message };
  }

  /** Delete a branch. Fails if there are transactions, linked terminals, or inventory. */
  async deleteBranch(tenantId: string, branchId: string): Promise<void> {
    const status = await this.getBranchDeleteStatus(tenantId, branchId);
    if (!status.canDelete) {
      throw new Error(status.message || 'Branch cannot be deleted.');
    }
    await this.db.transaction(async (client) => {
      // Warehouse may have id = branchId; delete inventory rows for this warehouse first (warehouse is deleted with branch or we delete warehouse)
      await client.query('DELETE FROM shop_inventory WHERE tenant_id = $1 AND warehouse_id = $2', [tenantId, branchId]);
      await client.query('DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND warehouse_id = $2', [tenantId, branchId]);
      await client.query('DELETE FROM shop_warehouses WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
      await client.query('DELETE FROM shop_branches WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
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
    return this.db.query('SELECT * FROM shop_products WHERE tenant_id = $1 AND is_active = TRUE ORDER BY popularity_score DESC, name ASC', [tenantId]);
  }

  async getPopularProducts(tenantId: string, limit = 10) {
    return this.db.query(`
      SELECT p.*, SUM(si.quantity) as total_sold
      FROM shop_products p
      JOIN shop_sale_items si ON p.id = si.product_id AND si.tenant_id = $1
      WHERE p.tenant_id = $1 AND p.is_active = TRUE
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT $2
    `, [tenantId, limit]);
  }

  async recalculatePopularityScores(tenantId: string) {
    return this.db.execute(`
      WITH product_sales AS (
        SELECT product_id, SUM(quantity) as total_sold
        FROM shop_sale_items
        WHERE tenant_id = $1
        GROUP BY product_id
      )
      UPDATE shop_products
      SET popularity_score = COALESCE(ps.total_sold, 0),
          updated_at = NOW()
      FROM product_sales ps
      WHERE id = ps.product_id AND tenant_id = $1
    `, [tenantId]);
  }

  async createProduct(tenantId: string, data: any) {
    const productId = await this.db.transaction(async (client) => {
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

        const mobileDesc = data.mobile_description ?? data.description ?? null;
        const createdBy = data.created_by || data.createdBy || null;
        const res = await client.query(`
          INSERT INTO shop_products (
            tenant_id, name, sku, barcode, category_id, unit,
            cost_price, retail_price, tax_rate, reorder_point, image_url, is_active, mobile_description, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
        `, [
          tenantId, data.name, sku, data.barcode || null,
          categoryId, data.unit || 'pcs', data.cost_price || 0, data.retail_price || 0,
          data.tax_rate || 0, data.reorder_point || 10, normalizeImageUrl(data.image_url), true, mobileDesc,
          createdBy,
        ]);
        const pid = res[0].id;

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

        await client.query(`
          INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING
        `, [tenantId, pid, warehouseId]);

        return pid;
      } catch (err: any) {
        console.error('❌ [ShopService] createProduct failed:', err);
        if (err.code === '23505') throw new Error(`SKU already exists.`);
        throw new Error(err.message || 'Unknown database error');
      }
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    return productId;
  }

  async updateProduct(tenantId: string, productId: string, data: any) {
    return this.db.transaction(async (client) => {
      try {
        const mobileDesc = data.mobile_description !== undefined ? data.mobile_description : (data.description !== undefined ? data.description : undefined);
        await client.query(`
          UPDATE shop_products
          SET name = $1, sku = $2, barcode = $3, category_id = $4, unit = $5,
              cost_price = $6, retail_price = $7, tax_rate = $8, reorder_point = $9,
              image_url = $10, is_active = $11, updated_at = NOW(),
              mobile_description = COALESCE($14, mobile_description)
          WHERE id = $12 AND tenant_id = $13
        `, [
          data.name, data.sku, data.barcode, data.category_id || data.categoryId,
          data.unit, data.cost_price || data.cost, data.retail_price || data.price,
          data.tax_rate || data.taxRate, data.reorder_point || data.reorderPoint,
          normalizeImageUrl(data.image_url), data.is_active !== undefined ? data.is_active : true, productId, tenantId,
          mobileDesc === undefined ? null : mobileDesc
        ]);
        return { success: true };
      } catch (err: any) {
        throw new Error(`Failed to update product: ${err.message}`);
      }
    });
  }

  /** Check if a product (SKU) can be deleted: no inventory on hand, and not used in any sales, mobile orders, or purchase bills. */
  async getProductDeleteStatus(tenantId: string, productId: string): Promise<{ canDelete: boolean; message?: string }> {
    const [invRows, saleRows, mobileRows, billRows] = await Promise.all([
      this.db.query<{ total: string }>(
        'SELECT COALESCE(SUM(quantity_on_hand), 0)::text AS total FROM shop_inventory WHERE tenant_id = $1 AND product_id = $2',
        [tenantId, productId]
      ),
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM shop_sale_items WHERE tenant_id = $1 AND product_id = $2',
        [tenantId, productId]
      ),
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM mobile_order_items WHERE tenant_id = $1 AND product_id = $2',
        [tenantId, productId]
      ),
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM purchase_bill_items WHERE tenant_id = $1 AND product_id = $2',
        [tenantId, productId]
      )
    ]);
    const totalOnHand = parseFloat(invRows[0]?.total ?? '0');
    const saleCount = parseInt(saleRows[0]?.count ?? '0', 10);
    const mobileCount = parseInt(mobileRows[0]?.count ?? '0', 10);
    const billCount = parseInt(billRows[0]?.count ?? '0', 10);
    if (totalOnHand > 0) {
      return { canDelete: false, message: 'This SKU cannot be deleted because it has inventory on hand. Please adjust or transfer stock to zero first.' };
    }
    if (saleCount > 0) {
      return { canDelete: false, message: 'This SKU cannot be deleted because it is used in sales transactions. Please delete or void those transactions first.' };
    }
    if (mobileCount > 0) {
      return { canDelete: false, message: 'This SKU cannot be deleted because it is used in mobile orders.' };
    }
    if (billCount > 0) {
      return { canDelete: false, message: 'This SKU cannot be deleted because it is used in procurement (purchase) bills. Please delete or amend those bills first.' };
    }
    return { canDelete: true };
  }

  /** Delete a product (SKU). Fails if has inventory or is used in any transaction (sales, mobile orders, purchase bills). */
  async deleteProduct(tenantId: string, productId: string): Promise<void> {
    const status = await this.getProductDeleteStatus(tenantId, productId);
    if (!status.canDelete) {
      throw new Error(status.message ?? 'This SKU cannot be deleted because it is used in transactions.');
    }
    await this.db.transaction(async (client) => {
      await client.query('DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND product_id = $2', [tenantId, productId]);
      const res = await client.query('DELETE FROM shop_products WHERE id = $1 AND tenant_id = $2 RETURNING id', [productId, tenantId]);
      if (res.length === 0) {
        throw new Error('Product not found or already deleted.');
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
    const row = await this.db.transaction(async (client) => {
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
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    return row;
  }

  // --- Sales Methods ---
  async createSale(tenantId: string, saleData: ShopSale) {
    if (!saleData?.items?.length) {
      throw new Error('Sale must have at least one item');
    }
    const paymentDetails = Array.isArray(saleData.paymentDetails) ? saleData.paymentDetails : [];
    const barcodeValue = `SALE|${tenantId}|${saleData.saleNumber}`;
    const result = await this.db.transaction(async (client) => {
      const saleRes = await client.query(`
        INSERT INTO shop_sales (
          tenant_id, branch_id, terminal_id, user_id, customer_id,
          loyalty_member_id, sale_number, subtotal, tax_total,
          discount_total, grand_total, total_paid, change_due,
          payment_method, payment_details, shift_id, barcode_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `, [
        tenantId,
        saleData.branchId ?? null,
        saleData.terminalId ?? null,
        saleData.userId ?? null,
        saleData.customerId ?? null,
        saleData.loyaltyMemberId ?? null,
        saleData.saleNumber,
        saleData.subtotal,
        saleData.taxTotal,
        saleData.discountTotal,
        saleData.grandTotal,
        saleData.totalPaid,
        saleData.changeDue,
        saleData.paymentMethod ?? 'Cash',
        JSON.stringify(paymentDetails),
        saleData.shiftId ?? null,
        barcodeValue
      ]);

      const saleId = saleRes[0].id;

      const itemsWithCost: ShopSaleItem[] = [];
      for (const item of saleData.items) {
        const unitCostAtSale = await fetchUnitCostForProduct(client, tenantId, item.productId);
        itemsWithCost.push({ ...item, unitCostAtSale });

        await client.query(`
          INSERT INTO shop_sale_items (tenant_id, sale_id, product_id, quantity, unit_price, tax_amount, discount_amount, subtotal, unit_cost_at_sale)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [tenantId, saleId, item.productId, item.quantity, item.unitPrice, item.taxAmount, item.discountAmount, item.subtotal, unitCostAtSale > 0 ? unitCostAtSale : null]);

        // Deduct from the sale's branch warehouse when branchId is set (branch id = warehouse id); otherwise first warehouse
        let warehouseId: string | null = null;
        if (saleData.branchId) {
          const branchWh = await client.query(
            'SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2 LIMIT 1',
            [saleData.branchId, tenantId]
          );
          if (branchWh.length > 0) warehouseId = branchWh[0].id;
        }
        if (!warehouseId) {
          const whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
          if (whRes.length > 0) warehouseId = whRes[0].id;
        }
        if (warehouseId) {
          await client.query(`
            UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1
            WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4
          `, [item.quantity, tenantId, item.productId, warehouseId]);

          const unitCost: number | null = unitCostAtSale > 0 ? unitCostAtSale : null;
          const totalCost: number | null = unitCost != null ? unitCost * item.quantity : null;
          await client.query(`
            INSERT INTO shop_inventory_movements (tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, unit_cost, total_cost)
            VALUES ($1, $2, $3, 'Sale', $4, $5, $6, $7, $8)
          `, [tenantId, item.productId, warehouseId, -item.quantity, saleId, saleData.userId, unitCost, totalCost]);
        }
      }

      if (saleData.loyaltyMemberId) {
        const pointsEarned = Math.floor(saleData.grandTotal / 100);
        await client.query(`
          UPDATE shop_loyalty_members
          SET points_balance = points_balance + $1, total_spend = total_spend + $2, visit_count = visit_count + 1
          WHERE id = $3 AND tenant_id = $4
        `, [pointsEarned, saleData.grandTotal, saleData.loyaltyMemberId, tenantId]);
        await client.query(`UPDATE shop_sales SET points_earned = $1 WHERE id = $2 AND tenant_id = $3`, [pointsEarned, saleId, tenantId]);
      }

      if (saleData.paymentDetails && Array.isArray(saleData.paymentDetails)) {
        // Only record the actual sale amount (grandTotal) in bank accounts, not the full tendered amount.
        // If customer pays 1000 for a 250 item, only 250 goes into the cash account.
        // The 750 change/refund is physical cash returned and should NOT inflate the books.
        let remainingToAllocate = saleData.grandTotal;
        for (const payment of saleData.paymentDetails) {
          if (payment.bankAccountId && remainingToAllocate > 0) {
            const effectiveAmount = Math.min(payment.amount, remainingToAllocate);
            remainingToAllocate -= effectiveAmount;
            await client.query(`
              UPDATE shop_bank_accounts 
              SET balance = COALESCE(balance, 0) + $1, updated_at = NOW() 
              WHERE id = $2 AND tenant_id = $3
            `, [effectiveAmount, payment.bankAccountId, tenantId]);
          }
        }
      }

      await this.postSaleToAccounting(client, saleId, tenantId, { ...saleData, items: itemsWithCost });

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

      // --- Khata / Credit: add debit entry to khata_ledger (customer credit system)
      const isKhata = (saleData.paymentMethod || '').toLowerCase().includes('khata');
      if (isKhata && saleData.customerId && saleData.grandTotal > 0) {
        await client.query(
          `INSERT INTO khata_ledger (tenant_id, customer_id, order_id, type, amount, note)
           VALUES ($1, $2, $3, 'debit', $4, $5)`,
          [tenantId, saleData.customerId, saleId, saleData.grandTotal, `Sale ${saleData.saleNumber}`]
        );
      }

      return { id: saleId, barcode_value: barcodeValue };
    });

    // Fire-and-forget: update popularity scores outside the transaction
    this.recalculatePopularityScores(tenantId).catch(err => console.error('PopScore Error:', err));

    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    notifyDailyReportUpdated(tenantId, 'sale_created').catch(() => {});

    return result;
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

    const accounting = getAccountingService();
    const getAcc = (code: string, name: string, type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense') =>
      accounting.getOrCreateAccountByCode(tenantId, code, name, type, client);

    const isCredit = saleData.paymentMethod === 'Credit';
    const isKhata = (saleData.paymentMethod || '').toLowerCase().includes('khata');

    // Revenue Ledger (Credit) – 41001 Retail Sales
    const revenueAcc = await getAcc(COA.RETAIL_SALES, 'Retail Sales', 'Income');
    await client.query(
      'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
      [tenantId, journalId, revenueAcc, saleData.grandTotal]
    );

    // Asset/Cash Ledger (Debit)
    if (isCredit || isKhata) {
      if (!saleData.customerId) throw new Error('Customer required for credit sale');
      const arAcc = await getAcc(COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset');
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, arAcc, saleData.grandTotal]
      );
      // customer_balance: legacy POS "Credit" only (khata uses khata_ledger for customer balance)
      if (isCredit && !isKhata) {
        await client.query(`
        INSERT INTO customer_balance (tenant_id, customer_id, balance) VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, customer_id) DO UPDATE SET balance = customer_balance.balance + $3, updated_at = NOW()
      `, [tenantId, saleData.customerId, saleData.grandTotal]);
      }
    } else {
      const payments = Array.isArray(saleData.paymentDetails) ? saleData.paymentDetails : [{ method: 'Cash', amount: saleData.grandTotal }];
      let remainingToAllocate = saleData.grandTotal;

      for (const p of payments) {
        if (remainingToAllocate <= 0) break;
        const effectiveAmount = Math.min(p.amount, remainingToAllocate);
        remainingToAllocate -= effectiveAmount;

        let debitAccId;
        if (p.bankAccountId) {
          const [bank] = await client.query(
            'SELECT name, account_type, chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
            [p.bankAccountId, tenantId]
          );
          if (bank?.chart_account_id) {
            debitAccId = bank.chart_account_id;
          } else {
            const accCode = bank?.account_type === 'Cash' ? COA.CASH_ON_HAND : COA.MAIN_BANK;
            const accName = bank?.account_type === 'Cash' ? 'Cash on Hand' : 'Main Bank Account';
            debitAccId = await getAcc(accCode, accName, 'Asset');
          }
        } else {
          const cashBank = await client.query(
            `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE ORDER BY name LIMIT 1`,
            [tenantId]
          );
          if (cashBank.length > 0 && cashBank[0].chart_account_id) {
            debitAccId = cashBank[0].chart_account_id;
          } else {
            debitAccId = await getAcc(COA.CASH_ON_HAND, 'Cash on Hand', 'Asset');
          }
        }

        await client.query(
          'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
          [tenantId, journalId, debitAccId, effectiveAmount]
        );
      }
    }

    // COGS vs Inventory: use per-line snapshot from sale time (not current shop_products)
    let totalCogs = 0;
    for (const item of saleData.items) {
      let unitCost = typeof item.unitCostAtSale === 'number' ? item.unitCostAtSale : NaN;
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        const prodRes = await client.query(
          'SELECT average_cost, cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2 LIMIT 1',
          [item.productId, tenantId]
        );
        unitCost = prodRes.length > 0 ? resolveUnitCostFromProductRow(prodRes[0]) : 0;
      }
      if (unitCost > 0) totalCogs += unitCost * item.quantity;
    }

    if (totalCogs > 0) {
      const cogsAcc = await getAcc(COA.COST_OF_GOODS_SOLD, 'Cost of Goods Sold', 'Expense');
      const invAssetAcc = await getAcc(COA.MERCHANDISE_INVENTORY, 'Merchandise Inventory', 'Asset');

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
        s.barcode_value as "barcodeValue", s.reprint_count as "reprintCount", s.printed_at as "printedAt",
        c.name as "customerName", b.name as "branchName", u.name as "cashierName", 
        COALESCE(cs.id, s.shift_id) as "shiftId", 'POS' as source,
        COALESCE((
          SELECT json_agg(json_build_object(
            'productId', si.product_id,
            'name', COALESCE(p.name, 'Unknown Product'),
            'quantity', si.quantity,
            'unitPrice', si.unit_price,
            'taxAmount', si.tax_amount,
            'discountAmount', si.discount_amount,
            'subtotal', si.subtotal,
            'unitCostAtSale', si.unit_cost_at_sale
          ))
          FROM shop_sale_items si
          LEFT JOIN shop_products p ON si.product_id = p.id AND p.tenant_id = $1
          WHERE si.sale_id = s.id AND si.tenant_id = $1
        ), '[]'::json) as items
      FROM shop_sales s
      LEFT JOIN contacts c ON s.customer_id = c.id AND c.tenant_id = $1
      LEFT JOIN shop_branches b ON s.branch_id = b.id AND b.tenant_id = $1
      LEFT JOIN users u ON s.user_id = u.id AND u.tenant_id = $1
      LEFT JOIN cashier_shifts cs ON s.shift_id = cs.id AND cs.tenant_id = $1
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
        NULL as "barcodeValue", 0 as "reprintCount", NULL as "printedAt",
        mc.name as "customerName", b.name as "branchName", NULL as "cashierName",
        NULL as "shiftId", 'Mobile' as source,
        COALESCE((
          SELECT json_agg(json_build_object(
            'productId', oi.product_id,
            'name', oi.product_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'taxAmount', oi.tax_amount,
            'discountAmount', oi.discount_amount,
            'subtotal', oi.subtotal,
            'unitCostAtSale', oi.unit_cost_at_sale
          ))
          FROM mobile_order_items oi
          WHERE oi.order_id = o.id AND oi.tenant_id = $1
        ), '[]'::json) as items
      FROM mobile_orders o
      LEFT JOIN mobile_customers mc ON o.customer_id = mc.id AND mc.tenant_id = $1
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

  /**
   * Ensure a loyalty member exists for a mobile app user: resolve or create a contact by phone, then insert membership if missing.
   * Idempotent — safe on registration and on first order (legacy users who were never enrolled).
   */
  async ensureLoyaltyMemberForMobileUser(
    tenantId: string,
    data: { phone: string; name: string; email?: string | null }
  ): Promise<string | null> {
    const phone = (data.phone || '').trim();
    if (!phone) return null;

    return this.db.transaction(async (client: any) => {
      let customerId: string;

      const existing = await client.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND contact_no = $2 LIMIT 1',
        [tenantId, phone]
      );
      if (existing.length > 0) {
        customerId = existing[0].id;
      } else {
        const newContactId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newContact = await client.query(`
          INSERT INTO contacts (id, tenant_id, name, type, contact_no, address)
          VALUES ($1, $2, $3, 'Customer', $4, $5) RETURNING id
        `, [newContactId, tenantId, data.name || 'Customer', phone, data.email || null]);
        customerId = newContact[0].id;
      }

      const already = await client.query(
        'SELECT id FROM shop_loyalty_members WHERE tenant_id = $1 AND customer_id = $2',
        [tenantId, customerId]
      );
      if (already.length > 0) {
        return already[0].id as string;
      }

      const digits = phone.replace(/\D/g, '');
      const baseCard = `L-${digits.slice(-8) || '00000000'}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const cardNumber = attempt === 0 ? baseCard : `${baseCard}-${attempt}`;
        try {
          const res = await client.query(`
            INSERT INTO shop_loyalty_members (tenant_id, customer_id, card_number, tier, status)
            VALUES ($1, $2, $3, 'Silver', 'Active') RETURNING id
          `, [tenantId, customerId, cardNumber]);
          return res[0].id as string;
        } catch (e: any) {
          if (e?.code === '23505' && attempt < 4) {
            continue;
          }
          const retry = await client.query(
            'SELECT id FROM shop_loyalty_members WHERE tenant_id = $1 AND customer_id = $2',
            [tenantId, customerId]
          );
          if (retry.length > 0) return retry[0].id as string;
          throw e;
        }
      }
      throw new Error('Could not create loyalty member');
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
      `SELECT id, name, type, parent_id, created_at FROM categories
       WHERE tenant_id = $1 AND type = 'product' AND deleted_at IS NULL ORDER BY name`,
      [tenantId]
    );
  }

  async createShopCategory(tenantId: string, data: { name: string; parentId?: string | null }) {
    let parentId: string | null = data.parentId ?? null;
    if (parentId) {
      const parentRows = await this.db.query(
        `SELECT id FROM categories WHERE id = $1 AND tenant_id = $2 AND type = 'product'
         AND deleted_at IS NULL AND parent_id IS NULL`,
        [parentId, tenantId]
      );
      if (parentRows.length === 0) {
        const err: any = new Error('Parent category not found or must be a main category.');
        throw err;
      }
    }
    const id = `shop_cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await this.db.query(
      `INSERT INTO categories (id, tenant_id, name, type, parent_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'product', $4, NOW(), NOW())`,
      [id, tenantId, data.name, parentId]
    );
    return id;
  }

  async updateShopCategory(tenantId: string, categoryId: string, data: { name: string; parentId?: string | null }) {
    if ('parentId' in data) {
      const parentId = data.parentId ?? null;
      if (parentId && parentId === categoryId) {
        const err: any = new Error('A category cannot be its own parent.');
        throw err;
      }
      if (parentId) {
        const parentRows = await this.db.query(
          `SELECT id FROM categories WHERE id = $1 AND tenant_id = $2 AND type = 'product'
           AND deleted_at IS NULL AND parent_id IS NULL`,
          [parentId, tenantId]
        );
        if (parentRows.length === 0) {
          const err: any = new Error('Parent category not found or must be a main category.');
          throw err;
        }
      }
      await this.db.query(
        `UPDATE categories SET name = $1, parent_id = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4 AND type = 'product'`,
        [data.name, parentId, categoryId, tenantId]
      );
    } else {
      await this.db.query(
        `UPDATE categories SET name = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3 AND type = 'product'`,
        [data.name, categoryId, tenantId]
      );
    }
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
  // Only returns bank accounts linked to the chart of accounts (user-created in Settings).
  // Unlinked/test accounts are excluded so POS and Collect Payment show only AST-100, AST-101, etc.
  async getBankAccounts(tenantId: string, activeOnly = true) {
    const clause = activeOnly ? 'AND sba.is_active = TRUE' : '';
    let accounts = await this.db.query(
      `SELECT sba.id, sba.name, sba.code, sba.account_type, sba.currency, sba.balance,
              sba.is_active, sba.created_at, sba.updated_at,
              a.code AS chart_code
       FROM shop_bank_accounts sba
       INNER JOIN accounts a ON a.id = sba.chart_account_id AND a.tenant_id = sba.tenant_id
       WHERE sba.tenant_id = $1 AND sba.chart_account_id IS NOT NULL ${clause}
       ORDER BY sba.name`,
      [tenantId]
    );

    // Ensure at least one Cash account exists for POS (creates one linked to chart)
    if (accounts.length === 0 && activeOnly) {
      await this.createBankAccount(tenantId, {
        name: 'Main Cash Account',
        code: 'CASH-01',
        account_type: 'Cash',
        currency: 'PKR'
      });
      accounts = await this.db.query(
        `SELECT sba.id, sba.name, sba.code, sba.account_type, sba.currency, sba.balance,
                sba.is_active, sba.created_at, sba.updated_at,
                a.code AS chart_code
         FROM shop_bank_accounts sba
         INNER JOIN accounts a ON a.id = sba.chart_account_id AND a.tenant_id = sba.tenant_id
         WHERE sba.tenant_id = $1 AND sba.chart_account_id IS NOT NULL ${clause}
         ORDER BY sba.name`,
        [tenantId]
      );
    }

    return accounts;
  }

  async createBankAccount(tenantId: string, data: { name: string; code?: string; account_type?: string; currency?: string }) {
    return this.db.transaction(async (client) => {
      // Reject if a bank account with the same name already exists (case-insensitive)
      const existingBank = await client.query(
        `SELECT id FROM shop_bank_accounts WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1`,
        [tenantId, data.name]
      );
      if (existingBank.length > 0) {
        const err: any = new Error(`A bank or cash account with this name already exists: "${data.name.trim()}"`);
        err.statusCode = 409;
        throw err;
      }

      const accountType = data.account_type || 'Bank';

      // Link to enterprise CoA: 11101–11105 for Cash/Bank; prefer first unused by type
      const cashCodes = [COA.CASH_ON_HAND, COA.PETTY_CASH, COA.MOBILE_WALLET];
      const bankCodes = [COA.MAIN_BANK, COA.SECONDARY_BANK];
      const codesForType = accountType === 'Cash' ? cashCodes : bankCodes;
      const linkedIds = await client.query(
        `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND chart_account_id IS NOT NULL`,
        [tenantId]
      );
      const linkedSet = new Set((linkedIds || []).map((r: any) => r.chart_account_id));
      const placeholders = codesForType.map((_: string, i: number) => `$${i + 2}`).join(', ');
      const accsByCode = await client.query(
        `SELECT id, code FROM accounts WHERE tenant_id = $1 AND code IN (${placeholders})`,
        [tenantId, ...codesForType]
      );
      let chartAccId: string | null = null;
      for (const a of accsByCode) {
        if (!linkedSet.has(a.id)) {
          chartAccId = a.id;
          break;
        }
      }
      if (!chartAccId) {
        const code = codesForType[0];
        const name = accountType === 'Cash' ? 'Cash on Hand' : 'Main Bank Account';
        chartAccId = await getAccountingService().getOrCreateAccountByCode(tenantId, code, name, 'Asset', client);
      }

      const res = await client.query(
        `INSERT INTO shop_bank_accounts (tenant_id, name, code, account_type, currency, chart_account_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, data.name, data.code || null, accountType, data.currency || 'BDT', chartAccId]
      );
      return res[0].id;
    });
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

  // --- Tenant Branding ---
  async getTenantBranding(tenantId: string) {
    const res = await this.db.query(
      `SELECT * FROM tenant_branding WHERE tenant_id = $1`,
      [tenantId]
    );
    if (res.length === 0) {
      // Create default branding
      const defaultRes = await this.db.query(
        `INSERT INTO tenant_branding (tenant_id) VALUES ($1) RETURNING *`,
        [tenantId]
      );
      return defaultRes[0];
    }
    return res[0];
  }

  async updateTenantBranding(tenantId: string, data: any) {
    const res = await this.db.query(
      `INSERT INTO tenant_branding (
        tenant_id, logo_url, logo_dark_url, primary_color, secondary_color,
        accent_color, font_family, theme_mode, address, lat, lng, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        logo_url = EXCLUDED.logo_url,
        logo_dark_url = EXCLUDED.logo_dark_url,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        accent_color = EXCLUDED.accent_color,
        font_family = EXCLUDED.font_family,
        theme_mode = EXCLUDED.theme_mode,
        address = EXCLUDED.address,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        updated_at = NOW()
      RETURNING *`,
      [
        tenantId, data.logo_url, data.logo_dark_url, data.primary_color,
        data.secondary_color, data.accent_color, data.font_family, data.theme_mode,
        data.address, data.lat, data.lng
      ]
    );
    return res[0];
  }

  // --- POS Settings ---
  async getPosSettings(tenantId: string) {
    const res = await this.db.query(
      `SELECT * FROM pos_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    if (res.length === 0) {
      const defaultRes = await this.db.query(
        `INSERT INTO pos_settings (tenant_id) VALUES ($1) RETURNING *`,
        [tenantId]
      );
      return defaultRes[0];
    }
    return res[0];
  }

  async updatePosSettings(tenantId: string, data: any) {
    const res = await this.db.query(
      `INSERT INTO pos_settings (tenant_id, auto_print_receipt, default_printer_name, receipt_copies, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         auto_print_receipt = EXCLUDED.auto_print_receipt,
         default_printer_name = EXCLUDED.default_printer_name,
         receipt_copies = EXCLUDED.receipt_copies,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        data.auto_print_receipt !== undefined ? data.auto_print_receipt : true,
        data.default_printer_name || null,
        data.receipt_copies !== undefined ? data.receipt_copies : 1
      ]
    );
    return res[0];
  }

  // --- Receipt Settings (pos_receipt_settings) ---
  async getReceiptSettings(tenantId: string) {
    const res = await this.db.query(
      'SELECT * FROM pos_receipt_settings WHERE tenant_id = $1',
      [tenantId]
    );
    if (res.length === 0) {
      const defaultRes = await this.db.query(
        `INSERT INTO pos_receipt_settings (tenant_id) VALUES ($1) RETURNING *`,
        [tenantId]
      );
      return defaultRes[0];
    }
    return res[0];
  }

  async updateReceiptSettings(tenantId: string, data: any) {
    const showLogo = data.show_logo !== undefined ? data.show_logo : false;
    const showBarcode = data.show_barcode !== undefined ? data.show_barcode : true;
    const barcodeType = (data.barcode_type && ['CODE128', 'CODE39', 'EAN13'].includes(data.barcode_type)) ? data.barcode_type : 'CODE128';
    const barcodePosition = (data.barcode_position && ['header', 'footer'].includes(data.barcode_position)) ? data.barcode_position : 'footer';
    const barcodeSize = (data.barcode_size && ['small', 'medium', 'large'].includes(data.barcode_size)) ? data.barcode_size : 'medium';
    const receiptWidth = (data.receipt_width && ['58mm', '80mm'].includes(data.receipt_width)) ? data.receipt_width : '80mm';
    const showTaxBreakdown = data.show_tax_breakdown !== undefined ? data.show_tax_breakdown : false;
    const showCashierName = data.show_cashier_name !== undefined ? data.show_cashier_name : true;
    const showShiftNumber = data.show_shift_number !== undefined ? data.show_shift_number : true;
    const footerMessage = data.footer_message ?? null;
    const shopName = data.shop_name ?? null;
    const shopAddress = data.shop_address ?? null;
    const shopPhone = data.shop_phone ?? null;
    const taxId = data.tax_id ?? null;
    const logoUrl = data.logo_url ?? null;
    const showMobileUrlQr = data.show_mobile_url_qr !== undefined ? data.show_mobile_url_qr : false;
    const res = await this.db.query(
      `INSERT INTO pos_receipt_settings (
        tenant_id, show_logo, show_barcode, barcode_type, barcode_position, barcode_size,
        receipt_width, show_tax_breakdown, show_cashier_name, show_shift_number,
        footer_message, shop_name, shop_address, shop_phone, tax_id, logo_url, show_mobile_url_qr, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        show_logo = EXCLUDED.show_logo,
        show_barcode = EXCLUDED.show_barcode,
        barcode_type = EXCLUDED.barcode_type,
        barcode_position = EXCLUDED.barcode_position,
        barcode_size = EXCLUDED.barcode_size,
        receipt_width = EXCLUDED.receipt_width,
        show_tax_breakdown = EXCLUDED.show_tax_breakdown,
        show_cashier_name = EXCLUDED.show_cashier_name,
        show_shift_number = EXCLUDED.show_shift_number,
        footer_message = EXCLUDED.footer_message,
        shop_name = EXCLUDED.shop_name,
        shop_address = EXCLUDED.shop_address,
        shop_phone = EXCLUDED.shop_phone,
        tax_id = EXCLUDED.tax_id,
        logo_url = EXCLUDED.logo_url,
        show_mobile_url_qr = EXCLUDED.show_mobile_url_qr,
        updated_at = NOW()
      RETURNING *`,
      [tenantId, showLogo, showBarcode, barcodeType, barcodePosition, barcodeSize, receiptWidth, showTaxBreakdown, showCashierName, showShiftNumber, footerMessage, shopName, shopAddress, shopPhone, taxId, logoUrl, showMobileUrlQr]
    );
    return res[0];
  }

  /** Increment reprint_count for a sale (tenant-scoped). Returns updated sale. */
  async incrementReprintCount(tenantId: string, saleId: string) {
    await this.db.query(
      `UPDATE shop_sales SET reprint_count = COALESCE(reprint_count, 0) + 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId]
    );
    const rows = await this.db.query(
      `SELECT id, sale_number as "saleNumber", reprint_count as "reprintCount" FROM shop_sales WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId]
    );
    return rows[0] || null;
  }

  /** Record printed_at for a sale (optional). */
  async markSalePrinted(tenantId: string, saleId: string) {
    await this.db.query(
      `UPDATE shop_sales SET printed_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId]
    );
  }

  /** Get sale by ID (for barcode lookup / detail). */
  async getSaleById(tenantId: string, saleId: string) {
    const rows = await this.db.query(
      `SELECT s.id, s.tenant_id as "tenantId", s.branch_id as "branchId", s.terminal_id as "terminalId",
        s.user_id as "userId", s.customer_id as "customerId", s.sale_number as "saleNumber",
        s.subtotal, s.tax_total as "taxTotal", s.discount_total as "discountTotal", s.grand_total as "grandTotal",
        s.total_paid as "totalPaid", s.change_due as "changeDue", s.payment_method as "paymentMethod",
        s.payment_details as "paymentDetails", s.status, s.created_at as "createdAt",
        s.barcode_value as "barcodeValue", s.reprint_count as "reprintCount", s.printed_at as "printedAt",
        c.name as "customerName", b.name as "branchName", u.name as "cashierName", COALESCE(cs.id, s.shift_id) as "shiftId",
        (SELECT json_agg(json_build_object('productId', si.product_id, 'name', COALESCE(p.name, 'Unknown'), 'quantity', si.quantity, 'unitPrice', si.unit_price, 'taxAmount', si.tax_amount, 'discountAmount', si.discount_amount, 'subtotal', si.subtotal, 'unitCostAtSale', si.unit_cost_at_sale))
         FROM shop_sale_items si LEFT JOIN shop_products p ON si.product_id = p.id AND p.tenant_id = $1 WHERE si.sale_id = s.id AND si.tenant_id = $1) as items
       FROM shop_sales s
       LEFT JOIN contacts c ON s.customer_id = c.id AND c.tenant_id = $1
       LEFT JOIN shop_branches b ON s.branch_id = b.id AND b.tenant_id = $1
       LEFT JOIN users u ON s.user_id = u.id AND u.tenant_id = $1
       LEFT JOIN cashier_shifts cs ON s.shift_id = cs.id AND cs.tenant_id = $1
       WHERE s.id = $2 AND s.tenant_id = $1`,
      [tenantId, saleId]
    );
    return rows[0] || null;
  }

  /** Find POS sale by invoice/sale number (for barcode SALE|tenant|invoice lookup). */
  async getSaleByInvoiceNumber(tenantId: string, saleNumber: string) {
    const rows = await this.db.query(
      `SELECT id FROM shop_sales WHERE tenant_id = $1 AND sale_number = $2 LIMIT 1`,
      [tenantId, saleNumber]
    );
    if (rows.length === 0) return null;
    return this.getSaleById(tenantId, rows[0].id);
  }

  /** Log a print attempt (optional traceability). */
  async logPrint(tenantId: string, data: { saleId: string; printedBy?: string; printerName?: string; success: boolean; errorMessage?: string }) {
    try {
      await this.db.query(
        `INSERT INTO print_logs (sale_id, printed_by, printer_name, success, error_message) VALUES ($1, $2, $3, $4, $5)`,
        [data.saleId, data.printedBy || null, data.printerName || null, data.success, data.errorMessage || null]
      );
    } catch (_) {
      // non-blocking
    }
  }
}

let shopServiceInstance: ShopService | null = null;
export function getShopService(): ShopService {
  if (!shopServiceInstance) {
    shopServiceInstance = new ShopService();
  }
  return shopServiceInstance;
}
