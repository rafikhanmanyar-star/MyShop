
import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const CartGrid: React.FC = () => {
    const { cart, removeFromCart, updateCartItem } = usePOS();

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Table Header - Sticky */}
            <div className="grid grid-cols-[1fr_100px_140px_100px_48px] gap-4 px-6 py-4 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-20 items-center">
                <div>Item Description</div>
                <div className="text-center">Rate</div>
                <div className="text-center">Quantity</div>
                <div className="text-right">Amount</div>
                <div></div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto pos-scrollbar bg-white">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 32 })}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-400">Your cart is empty</h3>
                        <p className="text-xs text-slate-400 mt-1">Add items to start a sale</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {cart.map((item) => (
                            <div
                                key={item.id}
                                className="grid grid-cols-[1fr_100px_140px_100px_48px] gap-4 px-6 py-4 hover:bg-blue-50/30 transition-colors group items-center"
                            >
                                <div className="min-w-0 flex flex-col">
                                    <div className="text-sm font-semibold text-slate-800 truncate uppercase tracking-tight">{item.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{item.sku.slice(-6)}</span>
                                        {item.categoryId && (
                                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis italic">in {item.categoryId}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center text-sm font-medium text-slate-600 font-mono">
                                    {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>

                                <div className="flex items-center justify-center">
                                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                        <button
                                            onClick={() => updateCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-90"
                                        >
                                            {React.cloneElement(ICONS.minus as React.ReactElement, { size: 14 })}
                                        </button>
                                        <input
                                            type="text"
                                            className="w-10 text-center text-sm font-bold bg-transparent border-none focus:ring-0 text-slate-900 p-0"
                                            value={item.quantity}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val)) updateCartItem(item.id, { quantity: val });
                                            }}
                                        />
                                        <button
                                            onClick={() => updateCartItem(item.id, { quantity: item.quantity + 1 })}
                                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-90"
                                        >
                                            {React.cloneElement(ICONS.plus as React.ReactElement, { size: 14 })}
                                        </button>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm font-bold text-slate-900 font-mono">
                                        {((item.unitPrice * item.quantity) - item.discountAmount + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>

                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="text-slate-300 hover:text-rose-500 transition-all p-1.5 hover:bg-rose-50 rounded-lg"
                                    >
                                        {React.cloneElement(ICONS.trash as React.ReactElement, { size: 16 })}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer Summary - Stats */}
            {cart.length > 0 && (
                <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div>
                            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Total Items</span>
                            <span className="text-lg font-bold text-white">{cart.length}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-800"></div>
                        <div>
                            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Total Quantity</span>
                            <span className="text-lg font-bold text-white">{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Inventory Synced</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartGrid;

