-- Extend rider assignment: 'third_party' = no in-app rider dispatch (external couriers).
ALTER TABLE mobile_ordering_settings
    DROP CONSTRAINT IF EXISTS mobile_ordering_settings_rider_assignment_mode_check;

ALTER TABLE mobile_ordering_settings
    ADD CONSTRAINT mobile_ordering_settings_rider_assignment_mode_check
    CHECK (rider_assignment_mode IN ('auto', 'manual', 'third_party'));
