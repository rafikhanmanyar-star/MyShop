# Feedback & Suggestions Module

Customer feedback, product requests, POS management, and notifications for the MyShop platform.

## Database schema (migration `086-customer-feedback.sql`)

| Table | Purpose |
|-------|---------|
| `customer_feedback` | Main feedback record (type, message, status, priority, severity) |
| `feedback_ratings` | Overall / delivery / product quality ratings (1–5) |
| `product_requests` | Product name, brand, category, barcode, normalized demand key |
| `feedback_attachments` | Image URLs (`/uploads/feedback/…`) |
| `feedback_replies` | Staff and customer conversation thread |

All tables include `tenant_id` with Postgres RLS policies.

### Status values
`submitted` → `under_review` → `responded` → `resolved`

### Feedback types
`product_request`, `complaint`, `suggestion`, `delivery_feedback`, `app_feedback`, `feature_request`

## Mobile API (`/api/mobile/…`, customer JWT)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/feedback` | Submit feedback |
| `GET` | `/feedback` | List customer's feedback history |
| `GET` | `/feedback/:id` | Get single feedback with replies |
| `POST` | `/feedback/:id/reply` | Customer follow-up reply |
| `POST` | `/feedback/upload` | Upload image attachment (multipart `image`) |

### Submit body example
```json
{
  "feedbackType": "product_request",
  "message": "Would love to see this in store",
  "overallRating": 4,
  "deliveryRating": 5,
  "productQualityRating": 4,
  "orderId": "optional-order-id",
  "productRequest": {
    "productName": "Almond milk",
    "brand": "Organic Valley",
    "category": "Dairy",
    "notes": "Unsweetened 1L",
    "barcode": "123456789"
  },
  "attachmentUrls": ["/uploads/feedback/feedback-123.jpg"]
}
```

## Shop / POS API (`/api/shop/customer-feedback/…`, tenant JWT)

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/` | admin, accountant, pos_cashier | List/filter feedback (`module`, `search`, `status`, `type`, `priority`) |
| `GET` | `/stats` | view roles | Open / urgent / product request counts, avg rating |
| `GET` | `/analytics/product-requests` | view roles | Top requested products, trending brands, high-demand flags |
| `GET` | `/:id` | view roles | Full detail |
| `POST` | `/:id/reply` | admin, pos_cashier | Reply / thank customer |
| `PATCH` | `/:id` | admin, pos_cashier | Update status or priority |
| `POST` | `/upload-attachment` | admin, pos_cashier | Staff attachment upload |

### Module filters (`?module=`)
- `all`, `product_requests`, `complaints`, `delivery`, `suggestions`, `resolved`, `analytics`

## Notifications

- Postgres `pg_notify('customer_feedback_updated', payload)` on submit, reply, status change
- Mobile SSE stream (`/api/mobile/notifications/stream`) listens and pushes `feedback_event` to in-app inbox
- Customer bell badge updates via `customerNotifications` service (`kind: 'feedback'`)

## Smart priority

Server computes `severity_score` and `priority` from:
- Complaint / delivery feedback type
- Urgent keywords in message
- Low star ratings (≤2)
- Repeat complaints from same customer (30 days)

Products requested by **3+ customers** (same normalized name+brand) are flagged **high demand** in POS analytics.

## Security

- Tenant isolation via RLS + middleware (`tenant_id` on all queries)
- Uploads restricted to `image/*`, max 8MB, stored under `uploads/feedback/`
- Only `/uploads/feedback/` URLs accepted when linking attachments to feedback
- Input sanitization (length limits, control character strip)
- Customer can only read/reply to own feedback; staff routes use `checkRole`

## Mobile UI

- **Utils hub** → Feedback & Suggestions card
- **`/:shopSlug/feedback`** — submit form (chips, stars, voice textarea, product request, photos)
- **`/:shopSlug/feedback/history`** — timeline with status chips and staff replies

## POS UI

- Sidebar **Customer Feedback** under CUSTOMERS
- Submodules via query `?module=` (All, Product Requests, Complaints, Delivery, Suggestions, Resolved, Analytics)
