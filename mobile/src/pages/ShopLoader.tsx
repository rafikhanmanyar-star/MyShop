import { useEffect, useState } from 'react';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi } from '../api';
import BottomNav from '../components/BottomNav';
import Header from '../components/Header';
import FloatingCartBar from '../components/FloatingCartBar';
import CustomerNotificationsBridge from '../components/CustomerNotificationsBridge';
import OrderAcceptanceClosedBanner from '../components/OrderAcceptanceClosedBanner';
import OrderAcceptanceClosedLoginModal from '../components/OrderAcceptanceClosedLoginModal';
import PermissionOnboardingModal from '../components/permissions/PermissionOnboardingModal';
import { getShop, setShop } from '../services/offlineCache';
import { syncCatalogForShop } from '../services/catalogSync';
import { prefetchHomePromoSlideImages } from '../services/homePromoImageCache';
import type { TenantBranding } from '../context/AppContext';
import { normalizeBrandingFromApi } from '../utils/branding';

const DEFAULT_BRANDING: TenantBranding = {
    logo_url: null,
    logo_dark_url: null,
    primary_color: '#4f46e5',
    secondary_color: '#10b981',
    accent_color: '#f59e0b',
    font_family: 'system-ui',
    theme_mode: 'light',
    home_promo_slides: [],
    home_promo_interval_seconds: 5,
};

function applyBranding(shopData: { shop: { company_name?: string; name: string; brand_color?: string } }, brandingData: { primary_color?: string; secondary_color?: string; accent_color?: string } | null) {
    if (brandingData?.primary_color) {
        document.documentElement.style.setProperty('--primary', brandingData.primary_color);
    } else if (shopData.shop.brand_color) {
        document.documentElement.style.setProperty('--primary', shopData.shop.brand_color);
    }
    if (brandingData?.secondary_color) {
        document.documentElement.style.setProperty('--secondary', brandingData.secondary_color);
    }
    if (brandingData?.accent_color) {
        document.documentElement.style.setProperty('--accent', brandingData.accent_color);
    }
    document.title = `${shopData.shop.company_name || shopData.shop.name} — Order Online`;
}

export default function ShopLoader() {
    const { shopSlug } = useParams<{ shopSlug: string }>();
    const { pathname } = useLocation();
    const { state, dispatch, cartCount } = useApp();
    // Hide over Utilities flows so list actions (e.g. My Menu) aren’t covered above the tab bar.
    const base = shopSlug ? `/${shopSlug}` : '';
    const productsPath = `${base}/products`;
    const isHomePage = pathname === base || pathname === `${base}/`;
    const isBrowsePage =
        pathname === productsPath || pathname.startsWith(`${productsPath}?`);
    const hideFloatingCart =
        !!shopSlug &&
        (pathname === `${base}/utilities` ||
            pathname.startsWith(`${base}/utilities/`) ||
            pathname.startsWith(`${base}/feedback`) ||
            pathname.startsWith(`${base}/budget`) ||
            pathname.startsWith(`${base}/recipes`) ||
            pathname.startsWith(`${base}/my-menu`) ||
            pathname.startsWith(`${base}/menu-planner`) ||
            pathname.startsWith(`${base}/products/`));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [permissionOnboarding, setPermissionOnboarding] = useState(true);

    useEffect(() => {
        if (!shopSlug) return;
        if (state.shopSlug === shopSlug && state.shop) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        Promise.all([
            publicApi.getShopInfo(shopSlug),
            publicApi.getBranding(shopSlug)
        ])
            .then(([shopData, brandingData]) => {
                const branding = normalizeBrandingFromApi(brandingData) ?? DEFAULT_BRANDING;
                dispatch({
                    type: 'SET_SHOP',
                    slug: shopSlug,
                    shop: shopData.shop,
                    settings: shopData.settings,
                    branding,
                });
                setShop(shopSlug, { shop: shopData.shop, settings: shopData.settings, branding });
                applyBranding(shopData, branding);
                void prefetchHomePromoSlideImages(branding.home_promo_slides);
                if (!isOffline) {
                    syncCatalogForShop(shopSlug).catch(() => {});
                }
            })
            .catch(async () => {
                const cached = await getShop(shopSlug);
                if (cached) {
                    dispatch({
                        type: 'SET_SHOP',
                        slug: shopSlug,
                        shop: cached.shop,
                        settings: cached.settings,
                        branding: normalizeBrandingFromApi(cached.branding) ?? DEFAULT_BRANDING,
                    });
                    const cachedBranding = normalizeBrandingFromApi(cached.branding) ?? DEFAULT_BRANDING;
                    applyBranding({ shop: cached.shop }, cachedBranding);
                    void prefetchHomePromoSlideImages(cachedBranding.home_promo_slides);
                    if (!isOffline) {
                        syncCatalogForShop(shopSlug).catch(() => {});
                    }
                } else {
                    setError(isOffline ? 'This shop isn\'t available offline. Open a shop you\'ve visited before.' : 'Shop not found');
                }
            })
            .finally(() => setLoading(false));
    }, [shopSlug]);

    if (loading) {
        return (
            <div className="loading-page fade-in">
                <img
                    src="/icons/shop-logo.png"
                    alt="Shop logo"
                    className="loading-page-logo"
                />
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p style={{ fontSize: 15 }}>Loading shop...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="loading-page fade-in">
                <div style={{ fontSize: 48, marginBottom: 8 }}>🏪</div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Failed to resolve shop</h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: 280, textAlign: 'center', marginBottom: 16 }}>
                    The shop "<strong>{shopSlug}</strong>" was not found. It may not exist or mobile ordering is not enabled yet.
                </p>
                <button
                    onClick={() => window.location.href = '/'}
                    style={{
                        padding: '12px 24px',
                        background: 'var(--primary, #4F46E5)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    ← Go Back
                </button>
            </div>
        );
    }

    const outletClass = [
        'shop-outlet',
        isHomePage ? 'shop-outlet--home' : '',
        isBrowsePage ? 'shop-outlet--browse' : '',
        cartCount > 0 && !hideFloatingCart ? 'shop-outlet--cart-pad' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className="shop-shell">
            <CustomerNotificationsBridge />
            <Header />
            <OrderAcceptanceClosedLoginModal />
            <OrderAcceptanceClosedBanner />
            <div className={outletClass}>
                <Outlet />
            </div>
            {!hideFloatingCart && <FloatingCartBar />}
            <BottomNav />
            {permissionOnboarding ? (
                <PermissionOnboardingModal onComplete={() => setPermissionOnboarding(false)} />
            ) : null}
        </div>
    );
}
