# MyShop Rider App — Test Checklist

## Delivery flow
- [ ] Login with shop code + phone + PIN
- [ ] Toggle online/offline on home dashboard
- [ ] Accept new assignment from queue
- [ ] Mark picked up → on the way → arrived → delivered with OTP proof
- [ ] Failed delivery with reason + optional photo
- [ ] Multi-order: complete one while another stays in queue

## GPS & tracking
- [ ] Rider location updates while online (POS / customer map if wired)
- [ ] Navigate opens Google Maps with customer coordinates
- [ ] Route ETA shows on active delivery map
- [ ] Offline: actions queue and sync on reconnect

## COD
- [ ] COD amount shown on order card and detail
- [ ] Cash screen shows pending vs collected today
- [ ] Partial COD entry on delivery proof sheet
- [ ] Delivered order reflects collected amount in cash summary

## Real-time
- [ ] SSE pushes new assignment popup
- [ ] Queue refreshes after status change without manual reload
- [ ] Reconnect after airplane mode — offline queue flushes

## Tenant isolation
- [ ] Rider A cannot see Rider B orders (different tenants)
- [ ] Wrong shop code on login fails

## Chat (rider ↔ POS)
- [ ] Rider sends message from Chat tab or order detail
- [ ] POS Order Center shows chat on delivery orders
- [ ] Quick-reply templates work both sides
- [ ] SSE refreshes chat without reload

## Route optimization
- [ ] Route tab shows ordered stops when multiple active deliveries
- [ ] Refresh route after GPS available
- [ ] Open delivery from stop card

## Push notifications
- [ ] VAPID keys set on server (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
- [ ] Rider grants notification permission on login
- [ ] Background notification on new assignment

## Analytics
- [ ] Stats tab shows 7-day deliveries, COD, distance, daily breakdown
- [ ] API `GET /api/rider/analytics?days=7`

## POS live rider map
- [ ] Order Center live map updates rider marker within ~5s (SSE + poll)
- [ ] Selected order rider position tracks on map
- [ ] `GET /shop/order-center/riders/live-locations`

## Performance
- [ ] Usable on small Android Chrome (375px width)
- [ ] PWA install + standalone display
- [ ] Map does not freeze UI on low-end device
