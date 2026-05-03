-- SQLite: add TTL for stale Pending mobile order reservations
ALTER TABLE mobile_ordering_settings ADD COLUMN pending_reservation_ttl_minutes INTEGER NOT NULL DEFAULT 30;
