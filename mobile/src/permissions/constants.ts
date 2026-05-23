export const PERMISSION_STORAGE_KEYS = {
    onboardingDone: 'myshop_permission_onboarding_v1',
    micRequestCount: 'myshop_permission_mic_requests_v1',
    locationRequestCount: 'myshop_permission_location_requests_v1',
} as const;

/** After this many denials we treat permission as permanently denied (Open Settings). */
export const PERMANENT_DENIAL_THRESHOLD = 2;

export const PERMISSION_COPY = {
    microphone: {
        title: 'Microphone access',
        reason:
            'We use your microphone for voice orders and voice search so you can shop hands-free.',
        privacy: 'Audio is only recorded when you tap Record or the mic button. We never listen in the background.',
        denied: 'Voice features need microphone access. You can still type your order or search manually.',
        permanent: 'Microphone access was blocked. Open Settings to enable it for voice orders and search.',
    },
    location: {
        title: 'Location access',
        reason:
            'We use your location to confirm delivery range, suggest your address, and show accurate delivery times.',
        privacy: 'Your location is only used for delivery and is shared with the shop for your order — never sold to third parties.',
        denied: 'Location access helps us verify delivery range. You can still pick a spot on the map or enter your address.',
        permanent: 'Location access was blocked. Open Settings to enable GPS for faster checkout.',
        gpsDisabled: 'Location services are turned off on your device. Enable GPS in system settings, then try again.',
    },
    welcome: {
        title: 'Permissions for a better experience',
        subtitle: 'MyShop needs a couple of permissions to deliver orders and accept voice requests.',
    },
} as const;
