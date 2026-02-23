import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getFullImageUrl } from '../api';

export default function Header() {
    const { shopSlug } = useParams();
    const { state, dispatch } = useApp();
    const [showMenu, setShowMenu] = useState(false);

    // Close menu when clicking outside
    useEffect(() => {
        if (!showMenu) return;

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // If the click is not on the button or its children, and not on the menu or its children
            if (!target.closest('.user-section')) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    if (!shopSlug) return null;

    // Use name if available, otherwise phone, otherwise 'U'
    const avatarChar = (state.customerName || state.customerPhone || 'U')[0].toUpperCase();

    return (
        <header className="main-header">
            <div className="header-content">
                <div className="header-brand">
                    <Link to={`/${shopSlug}`} className="shop-logo-link">
                        {(state.branding?.logo_url || state.shop?.logo_url) ? (
                            <img
                                src={getFullImageUrl(state.branding?.logo_url || state.shop?.logo_url || undefined)}
                                alt="Logo"
                                className="header-logo"
                                onError={(e) => {
                                    // If image fails to load, hide it and show text
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    const parent = (e.target as HTMLImageElement).parentElement;
                                    if (parent) {
                                        const text = document.createElement('span');
                                        text.className = 'header-shop-name';
                                        text.innerText = state.shop?.company_name || state.shop?.name || 'MyShop';
                                        parent.appendChild(text);
                                    }
                                }}
                            />
                        ) : (
                            <span className="header-shop-name">{state.shop?.company_name || state.shop?.name || 'MyShop'}</span>
                        )}
                    </Link>
                    <span className="header-version">v{__APP_VERSION__}</span>
                </div>

                <div className="user-section">
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
                                        <div className="menu-divider" />
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
                </div>
            </div>
        </header>
    );
}
