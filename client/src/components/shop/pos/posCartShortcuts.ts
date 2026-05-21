/** Primary keyboard shortcut to clear the POS cart (with confirmation). */
export const POS_CLEAR_CART_SHORTCUT_KEY = 'F11';
export const POS_CLEAR_CART_SHORTCUT_ALT = 'Ctrl+Shift+C';

export function requestClearCart(clearCart: () => void, cartLength: number): void {
    if (cartLength <= 0) return;
    if (window.confirm('Clear all items from the cart?')) {
        clearCart();
    }
}
