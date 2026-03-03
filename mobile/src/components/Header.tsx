import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getFullImageUrl, customerApi } from '../api';

type BranchItem = { id: string; name: string; code?: string; slug: string | null };

export default function Header() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch } = useApp();
    const { canInstall, promptInstall } = usePWAInstall();
    const [showMenu, setShowMenu] = useState(false);
    const [showBranchPicker, setShowBranchPicker] = useState(false);
    const [branches, setBranches] = useState<BranchItem[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);

    // Close menu when clicking outside
    useEffect(() => {
        if (!showMenu) return;

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.user-section')) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    const openBranchPicker = () => {
        setShowBranchPicker(true);
        setBranchesLoading(true);
        setShowMenu(false);
        customerApi.getBranches()
            .then((data) => setBranches(data.branches || []))
            .catch(() => setBranches([]))
            .finally(() => setBranchesLoading(false));
    };

    const selectBranch = (branch: BranchItem) => {
        if (!branch.slug) return;
        if (branch.slug === shopSlug) {
            setShowBranchPicker(false);
            return;
        }
        dispatch({ type: 'CLEAR_CART' });
        setShowBranchPicker(false);
        navigate(`/${branch.slug}`, { replace: true });
    };

    const shareShopOnWhatsApp = () => {
        const shopUrl = `${window.location.origin}/${shopSlug}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shopUrl)}`;
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        setShowMenu(false);
    };

    const checkForAppUpdate = () => {
        window.dispatchEvent(new CustomEvent('pwa-check-update'));
        setShowMenu(false);
    };

    if (!shopSlug) return null;

    // Use name if available, otherwise phone, otherwise 'U'
    const avatarChar = (state.customerName || state.customerPhone || 'U')[0].toUpperCase();

    return (
        <header className="main-header">
            <div className="header-content">
                <div className="header-brand">
                    <div className="header-brand-main">
                        <Link to={`/${shopSlug}`} className="shop-logo-link">
                            {(state.branding?.logo_url || state.shop?.logo_url) ? (
                                <img
                                    src={getFullImageUrl(state.branding?.logo_url || state.shop?.logo_url || undefined)}
                                    alt=""
                                    className="header-logo"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        const parent = (e.target as HTMLImageElement).parentElement;
                                        if (parent) {
                                            const initial = (state.shop?.company_name || state.shop?.name || 'M').charAt(0).toUpperCase();
                                            const span = document.createElement('span');
                                            span.className = 'header-logo-initial';
                                            span.innerText = initial;
                                            parent.appendChild(span);
                                        }
                                    }}
                                />
                            ) : (
                                <span className="header-logo-initial">
                                    {(state.shop?.company_name || state.shop?.name || 'M').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </Link>
                        <div className="header-shop-details">
                            <span className="header-shop-name">{state.shop?.company_name || state.shop?.name || 'MyShop'}</span>
                            {(state.shop?.address || state.branding?.address) && (
                                <span className="header-shop-address">{state.shop?.address || state.branding?.address}</span>
                            )}
                            {state.shop?.phone && (
                                <span className="header-shop-phone">{state.shop.phone}</span>
                            )}
                        </div>
                    </div>
                    <span className="header-version">v{__APP_VERSION__}</span>
                </div>

                <div className="user-section">
                    {canInstall && (
                        <button
                            type="button"
                            className="header-install-btn"
                            onClick={() => promptInstall()}
                            aria-label="Install app"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                <polyline points="16 6 12 2 8 6" />
                                <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                            <span>Install</span>
                        </button>
                    )}
                    <button className="user-icon-btn" onClick={() => setShowMenu(!showMenu)}>
                        {state.isLoggedIn ? (
                            <div className="avatar">
                                {avatarChar}
                            </div>
                        ) : (
                            <div className="avatar guest">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            </div>
                        )}
                    </button>

                    {showMenu && (
                        <>
                            <div className="user-menu scale-in">
                                {state.isLoggedIn ? (
                                    <>
                                        <div className="menu-header">
                                            <div className="user-name">{state.customerName || 'Customer'}</div>
                                            <div className="user-phone">{state.customerPhone}</div>
                                        </div>
                                        {(state.shop?.branchName || state.shop?.branchId) && (
                                            <>
                                                <div className="menu-divider" />
                                                <div className="menu-branch-info">
                                                    <span className="menu-branch-label">Current branch</span>
                                                    <span className="menu-branch-name">{state.shop?.branchName || 'Branch'}</span>
                                                </div>
                                                <button type="button" className="menu-item" onClick={openBranchPicker}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12" /><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M15 6a9 9 0 0 0-9 9" /><path d="M18 9v12" /></svg>
                                                    Switch branch
                                                </button>
                                            </>
                                        )}
                                        <div className="menu-divider" />
                                        <button type="button" className="menu-item" onClick={shareShopOnWhatsApp}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                                            Share obo
                                        </button>
                                        <button type="button" className="menu-item" onClick={checkForAppUpdate}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                                            Check for updates
                                        </button>
                                        <Link to={`/${shopSlug}/orders`} className="menu-item" onClick={() => setShowMenu(false)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /></svg>
                                            My Orders
                                        </Link>
                                        <Link to={`/${shopSlug}/budget`} className="menu-item" onClick={() => setShowMenu(false)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4 2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-2Z" /><path d="M18 5h.01" /><path d="M19 11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9" /><polyline points="8 13 12 17 16 13" /></svg>
                                            Budget Planner
                                        </Link>
                                        <Link to={`/${shopSlug}/account`} className="menu-item" onClick={() => setShowMenu(false)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                                            Account settings
                                        </Link>
                                        <div className="menu-divider" />
                                        <button className="menu-item logout" onClick={() => { dispatch({ type: 'LOGOUT' }); setShowMenu(false); }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                                            Logout
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="menu-header">
                                            <div className="user-name">Welcome!</div>
                                            <div className="user-phone">Sign in to manage orders</div>
                                        </div>
                                        <div className="menu-divider" />
                                        <button type="button" className="menu-item" onClick={shareShopOnWhatsApp}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                                            Share obo
                                        </button>
                                        <button type="button" className="menu-item" onClick={checkForAppUpdate}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                                            Check for updates
                                        </button>
                                        <Link to={`/${shopSlug}/login`} className="menu-item login-btn" onClick={() => setShowMenu(false)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 5 12 10 7" /><line x1="15" x2="3" y1="12" y2="12" /></svg>
                                            Login / Register
                                        </Link>
                                    </>
                                )}
                            </div>
                            <div className="menu-overlay active" onClick={() => setShowMenu(false)} />
                        </>
                    )}

                    {showBranchPicker && (
                        <>
                            <div className="menu-overlay active" onClick={() => setShowBranchPicker(false)} />
                            <div className="branch-picker scale-in">
                                <div className="branch-picker-title">Switch branch</div>
                                <p className="branch-picker-subtitle">Choose a branch to see its inventory and place orders there.</p>
                                {branchesLoading ? (
                                    <div className="branch-picker-loading">
                                        <div className="spinner" style={{ width: 28, height: 28 }} />
                                        <span>Loading branches…</span>
                                    </div>
                                ) : (
                                    <div className="branch-picker-list">
                                        {branches.filter(b => b.slug).map((branch) => (
                                            <button
                                                key={branch.id}
                                                type="button"
                                                className={`branch-picker-item ${branch.slug === shopSlug ? 'current' : ''}`}
                                                onClick={() => selectBranch(branch)}
                                            >
                                                <span className="branch-picker-item-name">{branch.name}</span>
                                                {branch.slug === shopSlug && <span className="branch-picker-item-badge">Current</span>}
                                            </button>
                                        ))}
                                        {!branchesLoading && branches.filter(b => b.slug).length === 0 && (
                                            <p className="branch-picker-empty">No other branches available.</p>
                                        )}
                                    </div>
                                )}
                                <button type="button" className="branch-picker-close" onClick={() => setShowBranchPicker(false)}>
                                    Close
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
