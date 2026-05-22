# Order Center — Unified POS Order Management

## Overview

The **Order Center** (`/order-center`) merges Mobile Orders and Voice Orders into a single three-panel dispatch UI for POS staff (`admin`, `pos_cashier`).

Legacy routes `/mobile-orders` and `/voice-orders` redirect to Order Center. Existing APIs remain for backward compatibility.

## Architecture

| Layer | Path |
|-------|------|
| UI | `client/src/components/shop/OrderCenterPage.tsx` |
| State | `client/src/context/OrderCenterContext.tsx` |
| API client | `client/src/services/orderCenterApi.ts` |
| Unified service | `server/services/orderCenterService.ts` |
| Routes | `server/api/routes/orderCenter.ts` → `/api/shop/order-center/*` |
| Migration | Included in `server/migrations/001-consolidated-schema.sql` (was `archive/082-order-center-unified.sql`) |

## Database (082)

**mobile_orders**

- `order_source` — `cart` \| `voice` \| `whatsapp` \| `pos` (default `cart`)
- `source_reference_id`
- `converted_from_voice_order_id` — links cart row created from voice invoice

**voice_orders**

- `order_source` (default `voice`)
- `cancelled_reason`, `cancelled_note`, `cancelled_by`, `cancelled_at`

PostgreSQL also adds `order_center_updated` NOTIFY on mobile/voice updates.

## Queue filters

| Filter | Meaning |
|--------|---------|
| `all` | Active orders (excludes cancelled) |
| `new` | Cart `Pending` or voice `Pending`/`Received` |
| `voice_pending` | Voice without invoice |
| `preparing` | Cart `Confirmed` or voice `Preparing`/`InvoiceCreated` |
| `ready` | Cart `Packed` |
| `delivered` | Delivered (both kinds) |
| `cancelled` | Cancelled voice + cart |
| `unpaid` | Cart delivered, payment unpaid |

## Voice cancellation

`POST /api/shop/order-center/voice/:id/cancel`

```json
{
  "reason": "unclear_audio",
  "note": "optional",
  "notifyCustomer": true
}
```

Reasons: `unclear_audio`, `out_of_service_area`, `product_unavailable`, `fake_order`, `customer_unreachable`, `duplicate_request`, `other`.

Also available at `POST /api/shop/voice-orders/:id/cancel`.

## Real-time

Unified SSE: `GET /api/shop/order-center/stream` listens to:

- `new_mobile_order`, `mobile_order_updated`
- `new_voice_order`, `voice_order_updated`
- `order_center_updated` (PG trigger)

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| ↑ / ↓ | Navigate queue |
| Enter | Refresh detail |
| Ctrl+F | Focus search |
| Ctrl+I | Open POS (voice invoice) |
| Ctrl+P | Print |
| Esc | (reserved for modals) |

## Testing checklist

- [ ] Run `npm run migrate` (consolidated schema includes Order Center tables)
- [ ] Place cart order from mobile PWA → appears in Order Center with green/cart badge
- [ ] Place voice order → purple badge, audio player, cancel flow
- [ ] Cancel voice order with each reason → status `Cancelled`, hidden from active queue, visible under Cancelled filter
- [ ] Create invoice from voice → POS checkout → auto-open Order Center on linked delivery order
- [ ] Customer approves invoice in mobile app (voice status `InvoiceCreated` → `Accepted`)
- [ ] Shop confirms in Order Center (`Pending` → `Confirmed` → `Packed` → …)
- [ ] Advance cart statuses Pending → Confirmed → Packed → OutForDelivery → Delivered
- [ ] Unpaid filter shows delivered COD unpaid orders
- [ ] SSE: new order sound + queue refresh
- [ ] `/mobile-orders` and `/voice-orders` redirect to `/order-center`
- [ ] Bell in header opens correct cart order
- [ ] Customer history tab loads spend + prior orders
- [ ] Tenant isolation: orders from other tenants never appear

## Operations slide-over

From the Order Center header toolbar:

| Button | Panel |
|--------|--------|
| **Live map** | Google Maps — customer drop-off, store, rider GPS (requires `VITE_GOOGLE_MAPS_API_KEY`) |
| **Riders** | Availability stats + active rider list |
| **Mobile settings** | Full mobile ordering config (QR, branding, rider mode, Twilio OTP, etc.) |

Select a **cart delivery** order in the queue, then open Live map. Rider assignment is in the center panel for cart orders. Press **Esc** to close the slide-over.

Voice/mobile settings are also still available under **Settings** in the main app.
