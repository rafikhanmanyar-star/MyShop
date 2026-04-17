-- Rider assignment mode: 'auto' = nearest available rider assigned at checkout,
-- 'manual' = POS operator picks the rider after receiving the order.
ALTER TABLE mobile_ordering_settings
    ADD COLUMN IF NOT EXISTS rider_assignment_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE mobile_ordering_settings
    DROP CONSTRAINT IF EXISTS mobile_ordering_settings_rider_assignment_mode_check;

ALTER TABLE mobile_ordering_settings
    ADD CONSTRAINT mobile_ordering_settings_rider_assignment_mode_check
    CHECK (rider_assignment_mode IN ('auto', 'manual'));
