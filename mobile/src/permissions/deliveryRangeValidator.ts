/**
 * Validates whether a customer pin falls within a shop branch delivery radius.
 * Client-side UX guard — server remains authoritative (mobileOrderBranchRouting).
 */

import { distanceBetween, formatDistance } from './geoDistance';
import type { DeliveryRangeValidationInput, DeliveryRangeValidationResult } from './types';

export function validateDeliveryRange(input: DeliveryRangeValidationInput): DeliveryRangeValidationResult {
    const unit = input.unit ?? 'km';
    const distanceKm = distanceBetween(input.customer, input.branch, 'km');
    const withinRange = distanceKm <= input.maxRadiusKm;
    const maxLabel = formatDistance(input.maxRadiusKm, unit);
    const distLabel = formatDistance(distanceKm, unit);

    const message = withinRange
        ? `Within delivery range (${distLabel} from branch, max ${maxLabel})`
        : `Outside delivery range (${distLabel} away — max ${maxLabel})`;

    return {
        withinRange,
        distanceKm,
        distanceFormatted: distLabel,
        message,
        maxRadiusKm: input.maxRadiusKm,
    };
}

/** Convenience for shop delivery_area shape from AppContext. */
export function validateCustomerAgainstBranch(
    customerLat: number,
    customerLng: number,
    branchLat: number,
    branchLng: number,
    maxDeliveryKm: number,
    unit: 'km' | 'mi' = 'km'
): DeliveryRangeValidationResult {
    return validateDeliveryRange({
        customer: { latitude: customerLat, longitude: customerLng },
        branch: { latitude: branchLat, longitude: branchLng },
        maxRadiusKm: maxDeliveryKm,
        unit,
    });
}
