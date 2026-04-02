
import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const CartGrid: React.FC = () => {
    const { cart, removeFromCart, updateCartItem, clearCart, grandTotal } = usePOS();

    const gridCols = 'minmax(0,1fr) minmax(70px,100px) minmax(100px,140px) minmax(80px,100px) 48px';

    const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);

    return (
        <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 relative overflow-hidden">
            {/* Table Header — reference: solid primary bar */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#0056b3] dark:bg-[#004494] text-white shrink-0 z-20">
                <span className="text-xs md:text-sm font-bold uppercase tracking-wider">Current cart</span>
                <button
                    type="button"
                    onClick={() => clearCart()}
                    disabled={cart.length === 0}
                    className="text-xs md:text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-[8px] border border-white/40 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Clear all
                </button>
            </div>
            <div className="grid gap-2 md:gap-4 px-3 md:px-4 py-2.5 bg-[#f8fafc] dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-700 text-xs md:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 items-center flex-shrink-0" style={{ gridTemplateColumns: gridCols }}>
                <div className="min-w-0">Item name</div>
                <div className="text-center">Price</div>
                <div className="text-center">Qty</div>
                <div className="text-right">Total</div>
                <div />
            </div>

            {/* Cart Items List */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pos-scrollbar bg-white dark:bg-slate-900">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 py-20">
                        <div className="w-16 h-16 bg-[#eef2ff] dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-[#0056b3] dark:text-slate-500">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 32 })}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Your cart is empty</h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add items to start a sale</p>
                    </div>
                ) : (
                    <div>
                        {cart.map((item, idx) => (
                            <div
                                key={item.id}
                                className={`grid gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-3.5 transition-colors group items-center min-w-0 border-b border-slate-100/90 dark:border-slate-800 ${
                                    idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-[#f4f7ff] dark:bg-slate-800/40'
                                }`}
                                style={{ gridTemplateColumns: gridCols }}
                            >
                                <div className="min-w-0 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-[8px] bg-[#eef2ff] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            React.cloneElement(ICONS.package as React.ReactElement, { size: 16, className: 'text-slate-300 dark:text-slate-600' })
                                        )}
                                    </div>
                                    <div className="min-w-0 flex flex-col">
                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.name}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-[4px]">#{item.sku.slice(-6)}</span>
                                            {item.categoryId && (
                                                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.categoryId}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center text-sm font-semibold text-[#0056b3] dark:text-blue-400 font-mono tabular-nums">
                                    {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>

                                <div className="flex items-center justify-center">
                                    <div className="flex items-center rounded-[8px] border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm bg-white dark:bg-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => updateCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                                            className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all active:scale-95"
                                        >
                                            {React.cloneElement(ICONS.minus as React.ReactElement, { size: 14 })}
                                        </button>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            aria-label={`Quantity for ${item.name}`}
                                            className="w-10 text-center text-sm font-bold bg-transparent border-none focus:ring-0 text-slate-900 dark:text-slate-100 p-0"
                                            value={item.quantity}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                if (raw === '') return;
                                                const val = parseInt(raw, 10);
                                                if (!isNaN(val) && val >= 1) {
                                                    updateCartItem(item.id, { quantity: Math.floor(val) });
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                if (isNaN(val) || val < 1) {
                                                    updateCartItem(item.id, { quantity: 1 });
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                                                    e.preventDefault();
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateCartItem(item.id, { quantity: item.quantity + 1 })}
                                            className="w-8 h-8 flex items-center justify-center bg-[#bbf7d0] dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300 hover:bg-[#86efac] dark:hover:bg-emerald-800/50 transition-all active:scale-95"
                                        >
                                            {React.cloneElement(ICONS.plus as React.ReactElement, { size: 14 })}
                                        </button>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                                        {((item.unitPrice * item.quantity) - item.discountAmount + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>

                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={() => removeFromCart(item.id)}
                                        className="text-slate-300 dark:text-slate-600 hover:text-rose-600 transition-all p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-[8px]"
                                    >
                                        {React.cloneElement(ICONS.trash as React.ReactElement, { size: 16 })}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {cart.length > 0 && (
                <div className="px-4 py-3.5 bg-[#eef2ff] dark:bg-slate-800/80 border-t border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">Total summary</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {cart.length} items <span className="text-slate-400">|</span> {totalQty} total qty
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">Total</span>
                        <span className="text-xl font-bold text-[#0056b3] dark:text-blue-400 tabular-nums">
                            {CURRENCY}{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartGrid;
