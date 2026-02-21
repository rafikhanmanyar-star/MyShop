import React from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const HeldSalesModal: React.FC = () => {
    const {
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        heldSales,
        recallSale
    } = usePOS();

    if (!isHeldSalesModalOpen) return null;

    return (
        <Modal
            isOpen={isHeldSalesModalOpen}
            onClose={() => setIsHeldSalesModalOpen(false)}
            title={<div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl pos-gradient-dark flex items-center justify-center text-white shadow-none">
                    {ICONS.refresh}
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-none tracking-tight">Suspended Orders</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Temporary Storage Vault</span>
                    </div>
                </div>
            </div>}
            size="lg"
        >
            <div className="space-y-6">
                {heldSales.length === 0 ? (
                    <div className="py-24 text-center animate-scale-in">
                        <div className="w-24 h-24 bg-[#f8fafc] text-slate-200 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-none">
                            {React.cloneElement(ICONS.archive as React.ReactElement, { size: 40, className: "opacity-20" })}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 uppercase">Vault is Empty</h3>
                        <p className="text-slate-500 font-bold text-sm mt-3 max-w-xs mx-auto leading-relaxed">Active transactions can be suspended by pressing <kbd className="bg-slate-100 text-slate-900 px-2 py-1 rounded-lg border border-slate-200 font-black mx-1">F2</kbd> for later retrieval.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 max-h-[60vh] overflow-y-auto pr-3 pos-scrollbar pb-6">
                        {heldSales.map((sale) => (
                            <div
                                key={sale.id}
                                className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[2.5rem] hover:border-indigo-200 hover:shadow-none hover:shadow-none-500/5 transition-all group animate-slide-up"
                            >
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-[#f8fafc] rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-none">
                                        {ICONS.shoppingCart}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-4 mb-2">
                                            <span className="font-black text-slate-900 uppercase tracking-tight text-lg leading-none">
                                                {sale.reference || 'NAMED TRANSACTION'}
                                            </span>
                                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-amber-100/50">
                                                {new Date(sale.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] flex items-center gap-4">
                                            <span className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
                                                {sale.cart.length} LINE ITEMS
                                            </span>
                                            <span className="text-indigo-600 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full"></span>
                                                {CURRENCY} {sale.total.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        recallSale(sale.id);
                                        setIsHeldSalesModalOpen(false);
                                    }}
                                    className="px-8 py-4 pos-gradient-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.25em] transition-all shadow-none active:scale-95 flex items-center gap-3"
                                >
                                    {ICONS.refresh}
                                    RECALL
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default HeldSalesModal;

