import { Link, useParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// Simple SVG icons (inline to avoid lucide dependency)
const icons = {
    home: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    search: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
    cart: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>,
    orders: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /></svg>,
    budget: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4 2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-2Z" /><path d="M18 5h.01" /><path d="M19 11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9" /><polyline points="8 13 12 17 16 13" /></svg>
};

export default function BottomNav() {
    const { shopSlug } = useParams();
    const { pathname } = useLocation();
    const { cartCount } = useApp();

    if (!shopSlug) return null;

    const base = `/${shopSlug}`;
    const isActive = (path: string) => {
        if (path === base) return pathname === base;
        return pathname.startsWith(path);
    };

    return (
        <nav className="bottom-nav">
            <Link to={base} className={isActive(base) ? 'active' : ''}>
                {icons.home}
                <span>Home</span>
            </Link>
            <Link to={`${base}/products`} className={isActive(`${base}/products`) ? 'active' : ''}>
                {icons.search}
                <span>Browse</span>
            </Link>
            <Link to={`${base}/cart`} className={isActive(`${base}/cart`) ? 'active' : ''} style={{ position: 'relative' }}>
                {icons.cart}
                <span>Cart</span>
                {cartCount > 0 && <span className="badge">{cartCount > 99 ? '99+' : cartCount}</span>}
            </Link>
            <Link to={`${base}/orders`} className={isActive(`${base}/orders`) ? 'active' : ''}>
                {icons.orders}
                <span>Orders</span>
            </Link>
            <Link to={`${base}/budget`} className={isActive(`${base}/budget`) ? 'active' : ''}>
                {icons.budget}
                <span>Budget</span>
            </Link>
        </nav>
    );
}
