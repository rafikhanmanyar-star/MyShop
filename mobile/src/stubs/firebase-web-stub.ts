/** Stubs for Capacitor Firebase web shims — native Android uses the real SDK via Capacitor bridge. */

export const getAnalytics = () => ({});
export const logEvent = () => {};
export const setAnalyticsCollectionEnabled = () => {};
export const setConsent = () => {};
export const setUserId = () => {};
export const setUserProperties = () => {};

export const getApp = () => ({});
export const initializeApp = () => ({});

export const getMessaging = () => ({});
export const getToken = async () => '';
export const deleteToken = async () => {};
export const isSupported = async () => false;
export const onMessage = () => () => {};
