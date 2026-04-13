import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function FloatingCartBar() {
    const { shopSlug } = useParams();
    const { cartTotal, cartCount } = useApp();

    if (!shopSlug || cartCount <= 0) return null;

    return (
        <Link
            to={`/${shopSlug}/cart`}
            className="floating-cart-bar"
            aria-label="View cart"
        >
            <span className="floating-cart-bar__icon" aria-hidden>🛒</span>
            <span className="floating-cart-bar__text">
                {cartCount} {cartCount === 1 ? 'item' : 'items'} | Rs. {cartTotal.toLocaleString()}
            </span>
            <span className="floating-cart-bar__cta">View Cart →</span>
        </Link>
    );
}
