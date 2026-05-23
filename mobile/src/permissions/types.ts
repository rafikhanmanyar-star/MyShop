/** Unified permission lifecycle states for UI and feature gating. */
export type PermissionStatus =
    | 'unknown'
    | 'granted'
    | 'denied'
    | 'prompt'
    | 'permanently_denied'
    | 'unavailable';

export type PermissionKind = 'microphone' | 'location';

export interface PermissionCheckResult {
    status: PermissionStatus;
    /** Human-readable message for toasts / empty states. */
    message?: string;
    /** True when device location services (GPS) appear disabled. */
    locationServicesDisabled?: boolean;
}

export interface PermissionRequestResult extends PermissionCheckResult {
    /** Whether the user can be prompted again via the system dialog. */
    canAskAgain: boolean;
}

export type DistanceUnit = 'km' | 'mi';

export interface GeoCoordinates {
    latitude: number;
    longitude: number;
}

export interface DeliveryRangeValidationInput {
    customer: GeoCoordinates;
    branch: GeoCoordinates;
    maxRadiusKm: number;
    unit?: DistanceUnit;
}

export interface DeliveryRangeValidationResult {
    withinRange: boolean;
    distanceKm: number;
    distanceFormatted: string;
    message: string;
    maxRadiusKm: number;
}
