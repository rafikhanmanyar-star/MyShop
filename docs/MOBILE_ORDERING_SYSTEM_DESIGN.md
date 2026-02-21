# MyShop Mobile Ordering System — Production Design Document

> **Author**: System Architect | **Date**: 2026-02-21  
> **Status**: Draft | **Version**: 1.1  
> **Scope**: Extend the existing MyShop POS with a customer-facing Mobile Ordering PWA (via QR Code)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Database Design](#3-database-design)
4. [Inventory Strategy](#4-inventory-strategy)
5. [Real-Time Order Receiving](#5-real-time-order-receiving)
6. [Security](#6-security)
7. [Performance](#7-performance)
8. [Admin Controls](#8-admin-controls)
9. [Failure Scenarios](#9-failure-scenarios)
10. [UI Flow](#10-ui-flow)
11. [API Endpoint List](#11-api-endpoint-list)
12. [Tech Stack](#12-tech-stack)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Executive Summary

This document extends the existing **MyShop POS** (Express + PostgreSQL/SQLite + React/Vite + Electron) with a **customer-facing Mobile Ordering App**. The mobile app allows customers to browse products, place orders, and track delivery — while the POS receives orders in real-time and manages fulfillment.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile app connects to | **Cloud API only** | POS local DB is unreachable from internet |
| Product data flow | **POS → Cloud → Mobile** | Single source of truth remains the POS |
| Real-time notifications | **SSE + PostgreSQL LISTEN/NOTIFY** | Already using PostgreSQL on Render; zero extra infra |
| App discovery | **QR Code → URL → PWA** | Zero friction: scan, open, browse. No app store needed |
| Mobile framework | **React PWA (Vite + React)** | Same stack as existing POS client; served as web app via URL; installable via "Add to Home Screen" |
| Customer auth | **OTP via SMS/WhatsApp** | Retail customers prefer phone-based auth over email/password |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUD (Render.com)                           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              MyShop Cloud API (Express.js)                   │   │
│  │                                                              │   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐  │   │
│  │  │ Shop API   │  │ Mobile API │  │ WebSocket / SSE       │  │   │
│  │  │ /api/shop  │  │ /api/mobile│  │ /api/ws/orders        │  │   │
│  │  │ (existing) │  │ (NEW)      │  │ (NEW)                 │  │   │
│  │  └─────┬──────┘  └─────┬──────┘  └──────────┬────────────┘  │   │
│  │        │               │                     │               │   │
│  │  ┌─────┴───────────────┴─────────────────────┴────────────┐  │   │
│  │  │            Shared Services Layer                       │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │   │
│  │  │  │ Order    │ │Inventory │ │ Customer │ │ Notif    │  │  │   │
│  │  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │  │  │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │   │
│  │  └───────────────────────┬────────────────────────────────┘  │   │
│  │                          │                                   │   │
│  │  ┌───────────────────────┴────────────────────────────────┐  │   │
│  │  │         PostgreSQL (Cloud - Render)                    │  │   │
│  │  │  • All tables with tenant_id isolation (RLS)           │  │   │
│  │  │  • LISTEN/NOTIFY for real-time events                  │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└──────────────────┬──────────────────────────┬───────────────────────┘
                   │                          │
          ┌────────┴────────┐       ┌─────────┴──────────┐
          │  POS Desktop    │       │  Mobile PWA         │
          │  (Electron)     │       │  (React + Vite)     │
          │                 │       │                     │
          │ ┌─────────────┐ │       │ Entry: QR Code scan │
          │ │ SQLite      │ │       │ URL: order.myshop   │
          │ │ (offline)   │ │       │   .com/{shop-slug}  │
          │ └──────┬──────┘ │       │                     │
          │        │ sync   │       │ • Browse products   │
          │ ┌──────┴──────┐ │       │ • Place orders      │
          │ │ Sync Manager│ │       │ • Track orders      │
          │ │ POS↔Cloud   │ │       │ • OTP auth          │
          │ └─────────────┘ │       │ • Add to Home Screen│
          │                 │       │   (installable PWA) │
          │ • Receive order │       └─────────────────────┘
          │   notifications │
          │ • Update order  │          ┌──────────────────┐
          │   status        │          │  QR Code (print) │
          │ • Manage stock  │          │  Generated by POS│
          │ • Generate QR   │          │  Printed as      │
          │   code for shop │          │  poster / sticker│
          └─────────────────┘          └──────────────────┘
```

### 2.2 Data Flow Model

```
PRODUCT & INVENTORY SYNC (POS → Cloud → Mobile):
─────────────────────────────────────────────────
  POS creates/updates product
       │
       ▼
  Sync Manager pushes to Cloud PostgreSQL
       │
       ▼
  Cloud DB updated (shop_products, shop_inventory)
       │
       ▼
  Mobile app fetches via GET /api/mobile/products


ORDER FLOW (Mobile → Cloud → POS):
───────────────────────────────────
  Customer places order on Mobile
       │
       ▼
  POST /api/mobile/orders → Cloud API
       │
       ▼
  Cloud DB: INSERT into mobile_orders + reserve stock
       │
       ▼
  PostgreSQL NOTIFY 'new_order' → WebSocket/SSE
       │
       ▼
  POS receives real-time notification
       │
       ▼
  POS syncs order to local SQLite
       │
       ▼
  Shop staff confirms/processes order
       │
       ▼
  Status update syncs back to Cloud → Mobile sees update
```

### 2.3 Sync Model

| Direction | Trigger | Data | Method |
|-----------|---------|------|--------|
| POS → Cloud | On product/inventory change + periodic (5 min) | Products, inventory, categories | REST PUT with `updated_at` comparison |
| Cloud → POS | SSE connection + periodic poll (30s) | New orders, status updates | SSE stream + REST GET fallback |
| Cloud → Mobile | On-demand (user browsing) | Products, categories, order status | REST GET with pagination |
| Mobile → Cloud | User action (place order) | Orders, customer data | REST POST |

### 2.4 QR Code & Shop Discovery

#### How Customers Find the App

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  SHOP PRINTS QR  │     │  CUSTOMER SCANS  │     │  PWA OPENS IN    │
│                  │     │                  │     │  BROWSER         │
│  ┌────────────┐  │     │  📱 Phone camera │     │                  │
│  │ ██████████ │  │────▶│  scans QR code   │────▶│  URL loads:      │
│  │ ██ QR ██  │  │     │                  │     │  order.myshop.com│
│  │ ██████████ │  │     │  Opens browser   │     │  /{shop-slug}    │
│  └────────────┘  │     │  automatically   │     │                  │
│                  │     │                  │     │  Shop branding   │
│  Poster/Sticker  │     └──────────────────┘     │  loaded from     │
│  Table tent      │                              │  tenant settings │
│  Receipt footer  │                              │                  │
└──────────────────┘                              │  Optional:       │
                                                  │  "Add to Home    │
                                                  │   Screen" prompt │
                                                  └──────────────────┘
```

#### QR Code URL Format

```
https://order.myshop.com/{shop-slug}

Examples:
  https://order.myshop.com/ali-general-store
  https://order.myshop.com/karachi-mart-dha
  https://order.myshop.com/fresh-grocery-f10
```

#### Shop Slug Rules

| Rule | Detail |
|------|--------|
| Format | Lowercase alphanumeric + hyphens, 3–50 chars |
| Uniqueness | Globally unique across all tenants |
| Generation | Auto-generated from `company_name` on tenant creation; editable by admin |
| Storage | New `slug` column on `tenants` table |
| Validation | Regex: `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$` |

#### QR Code Generation (POS Admin)

- Auto-generated when mobile ordering is enabled
- Available in **Settings → Mobile Ordering → QR Code**
- Download as PNG (300 DPI for print)
- Includes shop name below QR code
- Printable formats: poster (A4), table tent, sticker, receipt footer

#### PWA Capabilities

| Feature | Support |
|---------|--------|
| **Install to Home Screen** | Yes — prompted after 2nd visit or via banner |
| **Offline browsing** | Service worker caches product catalog for faster repeat visits |
| **Push notifications** | Supported via Web Push API (order status updates) |
| **Full-screen mode** | Yes — when launched from home screen, no browser chrome |
| **App icon & splash** | Configured via `manifest.json` with shop branding |

---

## 3. Database Design

### 3.1 New Tables (added to existing schema)

All new tables follow the existing `tenant_id` + RLS isolation pattern.

#### Tenants Table Update (add shop slug)

```sql
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#4F46E5';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
```

```sql
-- ============================================================================
-- MOBILE ORDERING: NEW TABLES
-- ============================================================================

-- 1. MOBILE CUSTOMERS (separate from POS contacts)
CREATE TABLE IF NOT EXISTS mobile_customers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    postal_code TEXT,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    otp_code TEXT,
    otp_expires_at TIMESTAMP,
    is_verified BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    device_token TEXT,              -- For push notifications (FCM)
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- 2. MOBILE ORDERS
CREATE TABLE IF NOT EXISTS mobile_orders (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id),
    branch_id TEXT REFERENCES shop_branches(id),
    order_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
        -- Enum: Pending, Confirmed, Packed, OutForDelivery, Delivered, Cancelled
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'COD',        -- COD or Prepaid
    payment_status TEXT DEFAULT 'Unpaid',     -- Unpaid, Paid, Refunded
    delivery_address TEXT,
    delivery_lat DECIMAL(10, 7),
    delivery_lng DECIMAL(10, 7),
    delivery_notes TEXT,
    estimated_delivery_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by TEXT,                        -- 'customer' or 'shop'
    idempotency_key TEXT UNIQUE,             -- Prevent duplicate orders
    pos_synced BOOLEAN DEFAULT FALSE,        -- Has POS downloaded this order?
    pos_synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, order_number)
);

-- 3. MOBILE ORDER ITEMS
CREATE TABLE IF NOT EXISTS mobile_order_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    product_name TEXT NOT NULL,               -- Snapshot at order time
    product_sku TEXT NOT NULL,                -- Snapshot at order time
    quantity DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,       -- Snapshot at order time
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    subtotal DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ORDER STATUS HISTORY (audit trail)
CREATE TABLE IF NOT EXISTS mobile_order_status_history (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES mobile_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT,                           -- user_id or 'system' or 'customer'
    changed_by_type TEXT DEFAULT 'system',     -- 'shop_user', 'customer', 'system'
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. MOBILE ORDERING SETTINGS (per-tenant config)
CREATE TABLE IF NOT EXISTS mobile_ordering_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    minimum_order_amount DECIMAL(15, 2) DEFAULT 0,
    delivery_fee DECIMAL(15, 2) DEFAULT 0,
    free_delivery_above DECIMAL(15, 2),       -- NULL = never free
    max_delivery_radius_km DECIMAL(5, 2),
    auto_confirm_orders BOOLEAN DEFAULT FALSE,
    order_acceptance_start TIME DEFAULT '09:00',
    order_acceptance_end TIME DEFAULT '21:00',
    estimated_delivery_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. PRODUCT MOBILE VISIBILITY (controls which products appear on mobile)
ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS mobile_visible BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS mobile_price DECIMAL(15, 2),  -- NULL = use retail_price
    ADD COLUMN IF NOT EXISTS mobile_description TEXT,
    ADD COLUMN IF NOT EXISTS mobile_sort_order INTEGER DEFAULT 0;

-- ============================================================================
-- INDEXES FOR MOBILE TABLES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_mobile_customers_tenant_phone
    ON mobile_customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_tenant
    ON mobile_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_customer
    ON mobile_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_status
    ON mobile_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_created
    ON mobile_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_orders_pos_synced
    ON mobile_orders(tenant_id, pos_synced) WHERE pos_synced = FALSE;
CREATE INDEX IF NOT EXISTS idx_mobile_order_items_order
    ON mobile_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_mobile_order_status_history_order
    ON mobile_order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_mobile
    ON shop_products(tenant_id, mobile_visible) WHERE mobile_visible = TRUE;

-- ============================================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================================
ALTER TABLE mobile_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_ordering_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON mobile_customers
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tenant_isolation ON mobile_orders
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tenant_isolation ON mobile_order_items
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tenant_isolation ON mobile_order_status_history
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY tenant_isolation ON mobile_ordering_settings
    FOR ALL USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
```

### 3.2 Multi-Tenant Isolation Strategy

| Layer | Mechanism |
|-------|-----------|
| **Database** | `tenant_id` column on every table + PostgreSQL RLS policies (existing pattern) |
| **API** | `tenantMiddleware` sets `app.current_tenant_id` per request (existing) |
| **Mobile API** | New `mobileAuthMiddleware` resolves `tenant_id` from customer JWT |
| **Shop Discovery** | Customer scans QR code → URL contains `{shop-slug}` → API resolves slug to `tenant_id` via `SELECT id FROM tenants WHERE slug = $1` |
| **Public browsing** | `publicTenantMiddleware` resolves `tenant_id` from `:shopSlug` URL param (no JWT needed) |

---

## 4. Inventory Strategy

### 4.1 Stock Reservation Flow

```
CUSTOMER PLACES ORDER
        │
        ▼
┌─────────────────────────────────────────────┐
│  1. BEGIN TRANSACTION                       │
│                                             │
│  2. FOR each item in cart:                  │
│     SELECT quantity_on_hand, quantity_reserved│
│     FROM shop_inventory                     │
│     WHERE product_id = ? AND warehouse_id = ?│
│     FOR UPDATE                              │ ← Row-level lock
│                                             │
│  3. available = on_hand - reserved          │
│     IF available < requested_qty → ROLLBACK │ ← Reject oversell
│                                             │
│  4. UPDATE shop_inventory                   │
│     SET quantity_reserved = reserved + qty  │ ← Reserve, don't deduct
│                                             │
│  5. INSERT mobile_order (status='Pending')  │
│  6. INSERT mobile_order_items               │
│  7. INSERT inventory_movement (type='Reserve')│
│                                             │
│  8. COMMIT                                  │
└─────────────────────────────────────────────┘
        │
        ▼
  SHOP CONFIRMS ORDER
        │
        ▼
┌─────────────────────────────────────────────┐
│  1. UPDATE shop_inventory                   │
│     SET quantity_on_hand = on_hand - qty    │
│         quantity_reserved = reserved - qty  │ ← Move from reserved to sold
│                                             │
│  2. UPDATE mobile_orders SET status='Confirmed'│
│  3. INSERT inventory_movement (type='MobileSale')│
└─────────────────────────────────────────────┘
        │
  IF SHOP CANCELS ORDER
        │
        ▼
┌─────────────────────────────────────────────┐
│  1. UPDATE shop_inventory                   │
│     SET quantity_reserved = reserved - qty  │ ← Release reservation
│                                             │
│  2. UPDATE mobile_orders SET status='Cancelled'│
│  3. INSERT inventory_movement (type='ReleaseReserve')│
└─────────────────────────────────────────────┘
```

### 4.2 Overselling Prevention

| Mechanism | Implementation |
|-----------|---------------|
| **`SELECT ... FOR UPDATE`** | Row-level DB lock during order placement transaction |
| **Available = on_hand - reserved** | Reserved stock is excluded from availability |
| **Atomic transaction** | All items validated before any reservation commits |
| **Stale reservation cleanup** | Cron job cancels `Pending` orders older than 30 min with no confirmation |
| **Mobile shows "available" stock** | `quantity_on_hand - quantity_reserved` exposed to mobile |

### 4.3 POS Offline Scenario

| Scenario | Behavior |
|----------|----------|
| POS offline, mobile order placed | Order stored in **Cloud DB**. Stock reserved in cloud. POS picks it up when back online. |
| POS sells in-store while offline | POS deducts from local SQLite. On sync, cloud inventory updated. **Conflict**: if cloud reserved + POS sold > actual stock → order auto-cancelled with notification to customer. |
| POS comes back online | Sync Manager: (1) pushes local sales, (2) pulls unsynced mobile orders, (3) reconciles inventory. |

---

## 5. Real-Time Order Receiving

### 5.1 Recommended Approach: **Server-Sent Events (SSE) + PostgreSQL NOTIFY**

**Why SSE over WebSocket for this use case:**

| Factor | SSE | WebSocket | Firebase |
|--------|-----|-----------|----------|
| Complexity | Low (HTTP-based) | Medium | High (vendor lock-in) |
| Direction | Server → Client (sufficient for notifications) | Bidirectional (overkill) | Bidirectional |
| Reconnection | Built-in auto-reconnect | Manual | Auto |
| Works with Express | Native | Needs `ws` library | External SDK |
| Cost | Free | Free | Pay per connection |
| Firewall friendly | Yes (plain HTTP) | Sometimes blocked | Yes |

### 5.2 Implementation Flow

```
PostgreSQL                  Cloud API (Express)           POS Desktop
─────────                  ───────────────────           ───────────
INSERT mobile_order
       │
       ▼
pg_notify('new_order',     Listening on pg channel
  order_json)  ──────────► SSE endpoint streams event
                                    │
                                    ▼
                           GET /api/shop/orders/stream
                           (SSE connection from POS)
                                    │
                                    ▼
                           data: {"type":"new_order",    ──► POS receives
                                  "orderId":"...",            notification
                                  "orderNumber":"ORD-001",   │
                                  "total": 1250}              ▼
                                                         Desktop notification
                                                         + sound alert
                                                         + order appears in
                                                           POS order queue
```

### 5.3 Fallback Strategy

```
Priority 1: SSE stream (real-time, ~100ms latency)
        │ if connection drops
        ▼
Priority 2: Polling GET /api/shop/orders/pending every 15 seconds
        │ if API unreachable
        ▼
Priority 3: Manual refresh button in POS order panel
```

---

## 6. Security

### 6.1 Customer Authentication (Mobile)

```
FLOW: Phone-based OTP (deferred until checkout)
──────────────────────────────────────────────

1. Customer browses products freely (no auth required)
2. Customer adds items to cart (stored locally on device)
3. Customer taps "Place Order"
4. IF not logged in:
   a. Prompt for phone number
   b. POST /api/mobile/auth/request-otp { phone, tenantId }
   c. Server generates 6-digit OTP, stores hashed in mobile_customers
   d. Send OTP via SMS gateway (e.g., Twilio, local provider)
   e. Customer enters OTP
   f. POST /api/mobile/auth/verify-otp { phone, otp, tenantId }
   g. Server returns JWT: { customerId, tenantId, phone, exp: 30d }
5. Order placed with customer JWT

JWT Payload (Customer):
{
  "type": "mobile_customer",
  "customerId": "cust_xxx",
  "tenantId": "tenant_yyy",
  "phone": "+92300...",
  "iat": ...,
  "exp": ... (30 days)
}
```

### 6.2 Authentication Matrix

| Actor | Method | Token Lifetime | Middleware |
|-------|--------|---------------|------------|
| Shop Admin/Staff | Username + Password → JWT | 30 days | `tenantMiddleware` (existing) |
| Mobile Customer | Phone + OTP → JWT | 30 days | `mobileAuthMiddleware` (new) |
| Public browsing | Shop slug/QR → tenant resolution | No token | `publicTenantMiddleware` (new) |

### 6.3 API Security

| Measure | Implementation |
|---------|---------------|
| **Rate limiting** | `express-rate-limit`: 100 req/min for auth, 300 req/min for browsing |
| **Input validation** | `zod` schemas on all POST/PUT bodies |
| **SQL injection** | Parameterized queries (already in place) |
| **CORS** | Mobile app origin added to allowed list |
| **Idempotency** | `idempotency_key` on orders to prevent duplicates |
| **HTTPS** | Enforced on Render (already in place) |
| **Helmet** | HTTP security headers |

### 6.4 Role-Based Access for Order Management

| Role | Permissions |
|------|------------|
| `admin` | Full access: view/confirm/cancel/manage all orders + settings |
| `pos_cashier` | View orders, confirm, mark packed/delivered |
| `accountant` | View orders (read-only) for accounting |
| `mobile_customer` | Place order, view own orders, cancel own pending orders |

---

## 7. Performance

### 7.1 Target Metrics

| Metric | Target |
|--------|--------|
| Product catalog load | < 500ms for 500 products |
| Order placement | < 1s end-to-end |
| Order notification to POS | < 2s |
| Daily order capacity | 5,000+ orders |
| Concurrent mobile users | 500+ |

### 7.2 Optimization Strategies

| Area | Strategy |
|------|----------|
| **Product browsing** | Cursor-based pagination (20 items/page), category filtering |
| **Search** | PostgreSQL `tsvector` full-text search index on product name + SKU |
| **Images** | Serve from CDN (Cloudflare R2 or S3), responsive sizes (150px, 400px, 800px) |
| **Caching** | `Cache-Control` headers on product catalog (60s TTL). In-memory cache on server (node-cache, 30s TTL) |
| **DB queries** | Composite indexes on (tenant_id, status), (tenant_id, mobile_visible) |
| **Connection pool** | PG pool: min=5, max=30, idle=30s (scale with load) |
| **Response compression** | `compression` middleware on Express |

### 7.3 Pagination Pattern

```
GET /api/mobile/products?cursor=abc123&limit=20&category=electronics&search=phone

Response:
{
  "items": [...],
  "nextCursor": "def456",    // Base64-encoded (created_at, id)
  "hasMore": true,
  "totalCount": 142
}
```

---

## 8. Admin Controls

### 8.1 Mobile Ordering Settings (per tenant)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `is_enabled` | boolean | false | Master toggle for mobile ordering |
| `minimum_order_amount` | decimal | 0 | Minimum cart value to place order |
| `delivery_fee` | decimal | 0 | Standard delivery charge |
| `free_delivery_above` | decimal | null | Waive fee above this amount |
| `auto_confirm_orders` | boolean | false | Skip manual confirmation step |
| `order_acceptance_start` | time | 09:00 | Orders accepted after this time |
| `order_acceptance_end` | time | 21:00 | Orders not accepted after this time |
| `estimated_delivery_minutes` | int | 60 | Default ETA shown to customer |

### 8.2 Product Visibility Control

```sql
-- Existing shop_products table gets new columns:
mobile_visible BOOLEAN DEFAULT TRUE    -- Show/hide on mobile
mobile_price DECIMAL(15,2)             -- Override price for mobile (NULL = use retail_price)
mobile_description TEXT                -- Customer-friendly description
mobile_sort_order INTEGER DEFAULT 0    -- Display ordering
```

| Scenario | `mobile_visible` | `mobile_price` | Result |
|----------|-------------------|-----------------|--------|
| Normal product | true | NULL | Shown at `retail_price` |
| POS-only product | false | NULL | Hidden from mobile |
| Mobile special price | true | 450.00 | Shown at 450.00 (not retail_price) |

### 8.3 Pricing Sync Rules

| Rule | Behavior |
|------|----------|
| POS updates `retail_price` | Mobile uses `retail_price` unless `mobile_price` is set |
| POS updates `mobile_price` | Mobile immediately reflects change on next sync |
| Price at order time | Snapshot stored in `mobile_order_items.unit_price` — price changes don't affect existing orders |

---

## 9. Failure Scenarios

### 9.1 Failure Matrix

| Scenario | Detection | Resolution |
|----------|-----------|------------|
| **POS offline, mobile order placed** | `pos_synced = FALSE` | Order stored in cloud. POS pulls on reconnect. Customer sees "Pending". |
| **Network delay during order** | Client timeout (10s) | Client retries with same `idempotency_key`. Server deduplicates. |
| **Duplicate order submission** | `idempotency_key` UNIQUE constraint | DB rejects duplicate. API returns existing order. |
| **Order conflicts (stock sold in-store while reserved)** | Inventory reconciliation on POS sync | If `on_hand < reserved`, oldest pending orders auto-cancelled. Customer notified. |
| **SSE connection drops** | Built-in SSE reconnect + `Last-Event-ID` | POS reconnects and receives missed events from that ID forward. |
| **Customer places order outside hours** | `order_acceptance_start/end` check | API returns 422: "Shop is currently closed. Orders accepted 9AM–9PM." |
| **Product price changed after cart load** | Price re-validation at checkout | API compares cart prices vs current DB prices. If changed → return diff for customer to accept. |
| **OTP delivery failure** | Retry with exponential backoff | Allow 3 retries. After that, show "Contact shop directly" fallback. |

### 9.2 Inventory Reconciliation Algorithm

```
ON POS SYNC (POS comes online):
  1. POS pushes all local sales since last sync
  2. Cloud updates: quantity_on_hand -= POS_sold_qty
  3. Cloud checks: FOR EACH product with pending reservations:
       available = quantity_on_hand - quantity_reserved
       IF available < 0:
         // Oversold — cancel oldest pending mobile orders for this product
         CANCEL orders until available >= 0
         Notify affected customers
         Log conflict in mobile_order_status_history
  4. POS pulls all unsynced mobile orders (pos_synced = FALSE)
  5. Mark pulled orders as pos_synced = TRUE
```

---

## 10. UI Flow (Mobile App)

### 10.1 Screen Flow Diagram

```
┌──────────────────┐
│  QR CODE SCAN    │
│  (phone camera)  │
│                  │
│  Opens browser:  │
│  order.myshop.com│
│  /{shop-slug}    │
└────────┬─────────┘
         │
         ▼
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  SPLASH      │────▶│  HOME           │────▶│  PRODUCT LIST    │
│  (shop logo  │     │  • Categories   │     │  • Grid/List     │
│   + brand    │     │  • Search bar   │     │  • Price, stock  │
│   colors)    │     │  • Featured     │     │  • Add to cart   │
│              │     │  • Promotions   │     │  • Filter/Sort   │
│  PWA install │     │                 │     │                  │
│  banner      │     │  «Add to Home   │     └────────┬─────────┘
└─────────────┘     │   Screen» banner│                │
                    └────────┬────────┘                ▼
                             │                ┌──────────────────┐
                    ┌────────┴────────┐       │  PRODUCT DETAIL  │
                    │  SEARCH RESULTS │       │  • Images        │
                    │  • Filtered     │       │  • Description   │
                    │    products     │       │  • Price + tax   │
                    │  • Category     │       │  • Stock status  │
                    │    pills        │       │  • Qty selector  │
                    └─────────────────┘       │  • Add to cart   │
                                             └────────┬─────────┘
                                                      │
                    ┌─────────────────────────────────┘
                    ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  CART            │────▶│  LOGIN/SIGNUP    │────▶│  CHECKOUT        │
│  • Item list    │     │  (first-time     │     │  • Delivery addr │
│  • Qty adjust   │     │   only, triggered│     │  • Delivery notes│
│  • Remove items │     │   at checkout)   │     │  • Payment: COD  │
│  • Subtotal     │     │  • Phone number  │     │  • Order summary │
│  • Delivery fee │     │  • OTP verify    │     │  • Place Order   │
│  • Grand total  │     │  • Name input    │     │    button        │
│  • Checkout btn │     │                  │     └────────┬─────────┘
└──────────────────┘     │  (returning)     │              │
                         │  • Auto-login    │              ▼
                         │    via stored    │     ┌──────────────────┐
                         │    JWT in        │     │  ORDER CONFIRM   │
                         │    localStorage  │     │  • Success anim  │
                         └──────────────────┘     │  • Order number  │
                                                  │  • ETA           │
                    ┌─────────────────────────────│  • Track button  │
                    │                             └──────────────────┘
                    ▼
┌──────────────────┐
│  ORDER TRACKING  │
│  • Status steps: │
│    ○ Pending     │
│    ● Confirmed   │     ┌──────────────────┐
│    ○ Packed      │────▶│  ORDER HISTORY   │
│    ○ Out for     │     │  • Past orders   │
│      Delivery    │     │  • Re-order      │
│    ○ Delivered   │     │  • Order details │
│  • Live updates  │     └──────────────────┘
│  • Contact shop  │
└──────────────────┘
```

### 10.2 Key UX Details

| Screen | Notes |
|--------|-------|
| **Entry** | Customer scans QR code (poster/sticker/receipt). Browser opens shop URL automatically. |
| **Home** | No login required. Shop branding (logo, `brand_color`) loaded from tenant settings. "Add to Home Screen" banner shown after 2nd visit. |
| **Product List** | Infinite scroll with cursor pagination. "Out of Stock" badge (greyed out, not hidden). Service worker caches catalog for instant repeat visits. |
| **Cart** | Persistent across sessions via `localStorage`. Badge count on bottom nav bar. |
| **Login** | Only triggered when customer taps "Place Order" with items in cart. Friction-free. JWT stored in `localStorage`. |
| **Checkout** | Re-validates prices and stock before final submission. Shows diff if prices changed. |
| **Order Tracking** | Real-time status via polling (every 10s while on this screen). Web Push notification on status change. |

---

## 11. API Endpoint List

### 11.1 Mobile Public API (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mobile/{shopSlug}/info` | Shop name, logo, hours, delivery settings |
| `GET` | `/api/mobile/{shopSlug}/categories` | Product categories |
| `GET` | `/api/mobile/{shopSlug}/products` | Paginated products (cursor, limit, category, search) |
| `GET` | `/api/mobile/{shopSlug}/products/:id` | Product detail with full description and images |

### 11.2 Mobile Auth API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/mobile/auth/request-otp` | `{ phone, shopSlug }` → send OTP |
| `POST` | `/api/mobile/auth/verify-otp` | `{ phone, otp, shopSlug }` → JWT |
| `POST` | `/api/mobile/auth/refresh` | Refresh expired token |

### 11.3 Mobile Customer API (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mobile/profile` | Customer profile |
| `PUT` | `/api/mobile/profile` | Update name, email, address |
| `POST` | `/api/mobile/orders` | Place order (with idempotency_key) |
| `GET` | `/api/mobile/orders` | Customer's order history (paginated) |
| `GET` | `/api/mobile/orders/:id` | Order detail with status history |
| `POST` | `/api/mobile/orders/:id/cancel` | Cancel own pending order |

### 11.4 POS / Shop API (existing auth, new endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/shop/mobile-orders` | All mobile orders (filterable by status) |
| `GET` | `/api/shop/mobile-orders/:id` | Order detail |
| `PUT` | `/api/shop/mobile-orders/:id/status` | Update status (Confirmed/Packed/etc.) |
| `GET` | `/api/shop/mobile-orders/stream` | **SSE** stream for real-time notifications |
| `GET` | `/api/shop/mobile-orders/unsynced` | Orders not yet synced to POS |
| `PUT` | `/api/shop/mobile-orders/:id/synced` | Mark order as synced to POS |
| `GET` | `/api/shop/mobile-settings` | Get mobile ordering settings |
| `PUT` | `/api/shop/mobile-settings` | Update mobile ordering settings |
| `PUT` | `/api/shop/products/:id/mobile` | Update mobile visibility/price for a product |

---

## 12. Tech Stack

### 12.1 Complete Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Mobile PWA** | React + Vite | Same stack as POS client. Separate Vite project under `mobile/` directory |
| **PWA Tooling** | `vite-plugin-pwa` | Service worker, manifest.json, offline caching |
| **Mobile Routing** | `react-router-dom` v6 | Same as POS client; bottom tab bar via CSS |
| **Mobile State** | React Context + `localStorage` | Cart persistence, auth token |
| **Mobile HTTP** | `fetch` API | Lightweight, no external dependency |
| **QR Code Gen** | `qrcode` npm package | Generate QR code PNG in POS admin settings |
| **Cloud API** | Express.js (existing) | Add new `/api/mobile` routes |
| **Cloud DB** | PostgreSQL on Render (existing) | Add new tables via migration |
| **Real-time** | SSE (native Express) + `pg` LISTEN/NOTIFY | Zero additional infra |
| **SMS/OTP** | Twilio or local SMS gateway | Pluggable provider interface |
| **Image Storage** | Cloudflare R2 or AWS S3 | CDN-backed, presigned uploads |
| **Push Notifications** | Web Push API | Browser-native push (no FCM needed for PWA) |
| **Validation** | Zod | Shared schemas between mobile and server |
| **Rate Limiting** | express-rate-limit | Per-endpoint limits |

### 12.2 New NPM Dependencies

**Server:**
```json
{
  "express-rate-limit": "^7.x",
  "zod": "^3.x",
  "helmet": "^7.x",
  "compression": "^1.x",
  "nanoid": "^5.x",
  "qrcode": "^1.x"
}
```

**Mobile PWA (`mobile/`):**
```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "react-router-dom": "^6.x",
  "lucide-react": "^0.460.x",
  "vite-plugin-pwa": "^0.20.x",
  "tailwindcss": "^4.x"
}
```

---

## 13. Implementation Phases

### Phase 1: Foundation (Week 1–2)
- [ ] Database migration: new tables + `shop_products` columns + `tenants.slug`
- [ ] `mobileOrderService.ts` — core order CRUD and inventory reservation
- [ ] `mobileCustomerService.ts` — OTP auth flow
- [ ] Mobile API routes (`/api/mobile/*`)
- [ ] Public tenant resolution via shop slug (`publicTenantMiddleware`)
- [ ] SSE endpoint for POS order notifications
- [ ] QR code generation endpoint in POS admin API

### Phase 2: Mobile PWA (Week 3–4)
- [ ] Create `mobile/` directory with Vite + React + PWA setup
- [ ] Configure `vite-plugin-pwa` (manifest.json, service worker, icons)
- [ ] Shop slug routing: `/{shop-slug}` → load tenant branding
- [ ] Home screen with categories and search
- [ ] Product listing and detail screens
- [ ] Cart with `localStorage` persistence
- [ ] OTP login flow (triggered at checkout)
- [ ] Checkout and order placement
- [ ] Order tracking screen
- [ ] Deploy PWA to Render (static site or same Express server)

### Phase 3: POS Integration (Week 5)
- [ ] POS order management panel (new tab/page in Electron app)
- [ ] SSE listener in POS client for real-time notifications
- [ ] Order status update workflow in POS
- [ ] Sync Manager extension for mobile orders
- [ ] QR code display + print in POS admin settings

### Phase 4: Admin & Polish (Week 6)
- [ ] Mobile ordering settings page in POS admin
- [ ] Product mobile visibility controls in inventory management
- [ ] Web Push notifications for order status updates
- [ ] Stale reservation cleanup cron job
- [ ] Rate limiting and security hardening
- [ ] PWA "Add to Home Screen" prompt optimization
- [ ] Testing with 1000+ concurrent orders

---

*End of Document*
