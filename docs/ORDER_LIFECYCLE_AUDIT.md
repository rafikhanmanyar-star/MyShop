# Order Lifecycle Audit — Mobile Cart + Voice Orders

**Date:** 2026-05-22  
**Scope:** End-to-end flow from customer placement through settlement  
**Status:** P0 fixes implemented; P1/P2 backlog documented

---

## Executive summary

MyShop uses **three parallel tracking dimensions**, not a single 12-value enum:

| Dimension | Storage | Values |
|-----------|---------|--------|
| Fulfillment | `mobile_orders.status` | Pending → Confirmed → Packed → OutForDelivery → Delivered (+ Cancelled) |
| Payment | `mobile_orders.payment_status` | Unpaid, Paid |
| Courier | `delivery_orders.status` | ASSIGNED → PICKED → ON_THE_WAY → DELIVERED |

Voice orders use a **separate pipeline** until invoice link, then share the cart fulfillment row (`converted_from_voice_order_id`).

**Implemented in this pass (P0):**

- Skip duplicate GL on voice/POS-invoiced delivery
- Shop can confirm/pack/cancel when rider is assigned (only dispatch/deliver locked to rider)
- Idempotent delivery/payment journals
- Voice `linkInvoice` duplicate mobile-order guard + unique index (migration 083)
- Voice cancel cascades to linked mobile order + releases delivery
- Rider pick advances only through Packed; OutForDelivery on “on the way”
- Order Center: rider lock UI, collect payment, voice approval gate

---

## Phase 1 — Flow audit findings

### Cart orders (mobile_orders)

| Area | Finding | Severity |
|------|---------|----------|
| Status machine | Linear 6-state; enforced in `mobileOrderService.updateOrderStatus` | OK |
| Rider auto-assign at place | Created `delivery_orders` immediately; **was** blocking all shop status updates | **Fixed** |
| Rider markPicked | **Was** jumping Pending→OutForDelivery in one action | **Fixed** (stops at Packed) |
| Inventory | Reserve at place; deduct at Delivered; doc said deduct at Confirmed | Doc drift (P2) |
| Payment | Collected after Delivered via `collectPayment` / khata | OK |
| Online wallet | `EasypaisaJazzcashOnline` stays Unpaid; no webhook | P1 |
| Accounting | Delivery posts AR+Revenue; payment posts Bank+AR | OK |
| Voice-linked deliver | **Was** posting second revenue journal | **Fixed** |
| Order Center | **Was** missing payment + rider lock | **Fixed** |

### Voice orders

| Area | Finding | Severity |
|------|---------|----------|
| Status machine | 9 states; `Accepted→Preparing` spurious transition | **Fixed** |
| linkInvoice | **Could** create duplicate `mobile_orders` | **Fixed** + migration 083 |
| Cancel voice | **Did not** cancel linked mobile/delivery | **Fixed** |
| Customer approve | Blocks shop Confirm until `Accepted` | UI + `voice_order_status` on detail |
| Notifications | Push/SMS stub (console only) | P1 |
| Offline POS link | Sale saved; voice link may fail | P1 |

### Tenant isolation

- Shop APIs: `tenantMiddleware` + `tenant_id` on all queries — **strong**
- SSE: filtered by `payload.tenantId` — **OK**
- Residual: `linkInvoice` does not verify sale customer = voice customer — P1

---

## Phase 2 — Lifecycle mapping (spec vs implementation)

| Spec state | Cart implementation | Voice implementation |
|------------|---------------------|----------------------|
| Draft | — | `Pending` (no audio) |
| Received | `Pending` | `Received` (audio attached) |
| Reviewing | — | `Received` / `Preparing` |
| Confirmed | `Confirmed` | After customer `Accepted` on linked cart |
| Invoice Created | — | `InvoiceCreated` + `created_invoice_id` |
| Preparing | `Confirmed` (kitchen) | `Preparing` (optional) |
| Ready | `Packed` | — |
| Rider Assigned | `delivery_orders.ASSIGNED` | Same via linked cart |
| Out For Delivery | `OutForDelivery` | Synced from cart |
| Delivered | `Delivered` | Synced from cart |
| Payment Collected | `payment_status = Paid` | Same on cart row |
| Completed | Paid + terminal status | `Delivered` |
| Cancelled | `Cancelled` | `Cancelled` |

Full 12-state rename would be a breaking migration; current mapping is sufficient for operations if UI labels stay consistent.

---

## Cart order flow (reference)

```
Customer POST /api/mobile/orders
  → Pending, Unpaid, stock RESERVED
  → [optional] auto-assign rider → delivery_orders ASSIGNED

Shop: Pending → Confirmed → Packed → OutForDelivery → Delivered
  → [Delivered] FEFO deduct (unless inventory_deducted)
  → [Delivered] GL revenue (unless voice/POS invoiced)
  → [Delivered] payment_status still Unpaid

Shop: collectPayment / khata → Paid + payment GL

Rider: markPicked → Packed (via chain)
       markOnTheWay → OutForDelivery + courier ON_THE_WAY
       markDelivered → Delivered
```

---

## Voice order flow (reference)

```
Customer create + upload audio → Received
POS checkout → linkInvoice(saleId)
  → InvoiceCreated, notify customer (stub)
  → createMobileOrderFromInvoice (one per voice order)
Customer approve → Accepted
Fulfillment via linked mobile_orders + Order Center
```

---

## Files changed (P0 implementation)

| File | Change |
|------|--------|
| `server/services/mobileOrderService.ts` | Rider lock scope, skip GL, release delivery on cancel, journal idempotency |
| `server/services/voiceOrderService.ts` | linkInvoice guards, cancel cascade, status fix |
| `server/services/riderDeliveryService.ts` | Pick chain, on-the-way → OutForDelivery |
| `server/migrations/083-order-lifecycle-hardening.sql` | Unique voice conversion index |
| `server/api/routes/orderCenter.ts` | collect-payment |
| `client/.../orderCenterUtils.ts` | Rider lock helpers |
| `client/.../OrderDetailPanel.tsx` | Rider banner, payment, approval gate |
| `client/.../CartCollectPaymentModal.tsx` | Payment UI |
| `client/src/services/orderCenterApi.ts` | collectCartPayment |

---

## Testing checklist

### Voice

- [ ] Create voice order → upload audio → Received
- [ ] POS invoice link → InvoiceCreated, one mobile row only
- [ ] Retry linkInvoice → no second mobile order
- [ ] Customer approve → shop can Confirm linked cart
- [ ] Cancel voice with linked cart → both Cancelled, rider released
- [ ] Deliver voice-linked order → no duplicate revenue journal

### Cart

- [ ] Place order → stock reserved
- [ ] Auto-rider assign → shop can still Confirm and Pack
- [ ] Rider pick → status reaches Packed only
- [ ] Rider on the way → OutForDelivery
- [ ] Deliver → inventory deduct, GL once
- [ ] Collect payment in Order Center → Paid

### Tenant

- [ ] Two tenants: orders, SSE, invoices isolated
- [ ] Voice recording URL not cross-tenant

### Payment

- [ ] COD delivered → collect bank
- [ ] COD delivered → collect khata
- [ ] Duplicate collect → rejected (already Paid)

---

## P1 backlog (not in this pass)

1. Push/SMS notifications (Twilio / FCM)
2. Online payment webhook → auto Paid
3. `linkInvoice` customer/sale matching
4. Align inventory doc or deduct on Confirmed
5. Offline POS voice link in sale sync queue
6. Partial payment / refund states
7. Failed delivery / returned statuses
8. Reporting views for conversions and rider collections

---

## P2 backlog

- OTP delivery verification
- Dead-letter for failed notifications
- SQLite SSE poll fallback
- Shop cancel when rider mid-delivery (policy)

Run migration **083** after deploy alongside existing **082** order-center schema.
