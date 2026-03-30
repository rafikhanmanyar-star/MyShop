
import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { StockAdjustment } from '../../../types/inventory';

const StockAdjustments: React.FC = () => {
    const { adjustments, approveAdjustment, warehouses, items, updateStock } = useInventory();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form state
    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
    const [adjustmentType, setAdjustmentType] = useState<'Increase' | 'Decrease'>('Increase');
    const [quantity, setQuantity] = useState('');
    const [reasonCode, setReasonCode] = useState('');
    const [notes, setNotes] = useState('');

    const handleOpenModal = () => {
        // Reset form
        setSelectedItemId('');
        setSelectedWarehouseId(warehouses[0]?.id || '');
        setAdjustmentType('Increase');
        setQuantity('');
        setReasonCode('');
        setNotes('');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedItemId || !selectedWarehouseId || !quantity || !reasonCode) {
            alert('Please fill in all required fields');
            return;
        }

        const qtyNum = parseFloat(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            alert('Please enter a valid positive quantity');
            return;
        }

        try {
            // Create adjustment ID for reference
            const adjustmentId = crypto.randomUUID();

            // Call updateStock directly to adjust inventory
            const delta = adjustmentType === 'Increase' ? qtyNum : -qtyNum;
            await updateStock(
                selectedItemId,
                selectedWarehouseId,
                delta,
                'Adjustment',
                adjustmentId,
                `${reasonCode}${notes ? ': ' + notes : ''}`
            );

            alert('Stock adjustment created and applied successfully!');
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Failed to create adjustment:', error);
            alert(`Failed to create adjustment: ${error.message || 'Unknown error'}`);
        }
    };

    const reasonCodes = [
        'Damaged Goods',
        'Theft/Loss',
        'Found Stock',
        'Reconciliation',
        'Expired Items',
        'Quality Control',
        'Data Correction',
        'Other'
    ];

    return (
        <div className="space-y-6 animate-fade-in shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-foreground tracking-tight">Adjustment Approval Queue</h3>
                <button
                    onClick={handleOpenModal}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                    {ICONS.plus} New Request
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {adjustments.length > 0 ? adjustments.map(adj => {
                    const item = items.find(i => i.id === adj.itemId);
                    const warehouse = warehouses.find(w => w.id === adj.warehouseId);

                    return (
                        <Card key={adj.id} className={`p-6 border-2 transition-all group ${adj.status === 'Approved' ? 'border-emerald-100 bg-emerald-50/20 dark:border-emerald-800/50 dark:bg-emerald-950/25' : 'border-amber-100 bg-amber-50/20 dark:border-amber-800/50 dark:bg-amber-950/25 shadow-xl'
                            }`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-2 rounded-lg ${adj.type === 'Increase' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'}`}>
                                    {adj.type === 'Increase' ? ICONS.plus : ICONS.minus}
                                </div>
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${adj.status === 'Approved' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                                    }`}>
                                    {adj.status}
                                </span>
                            </div>

                            <div className="space-y-1 mb-6">
                                <h4 className="font-black text-foreground tracking-tight">{item?.name || 'Unknown Item'}</h4>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                    {warehouse?.name} • Reason: {adj.reasonCode}
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border shadow-sm mb-6">
                                <span className="text-xs font-bold text-muted-foreground">Adjustment Qty</span>
                                <span className={`text-xl font-black font-mono ${adj.type === 'Increase' ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                    {adj.type === 'Increase' ? '+' : '-'}{adj.quantity}
                                </span>
                            </div>

                            {adj.status === 'Pending' ? (
                                <button
                                    onClick={() => approveAdjustment(adj.id)}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all"
                                >
                                    Approve & Commit
                                </button>
                            ) : (
                                <div className="text-[10px] text-muted-foreground font-medium italic text-center">
                                    Approved by {adj.approvedBy} on {new Date(adj.timestamp).toLocaleDateString()}
                                </div>
                            )}
                        </Card>
                    );
                }) : (
                    <div className="col-span-full py-20 bg-card border border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-slate-300 dark:text-slate-500 gap-4">
                        <div className="w-16 h-16 bg-muted/80 rounded-full flex items-center justify-center">
                            {React.cloneElement(ICONS.settings as React.ReactElement<any>, { width: 32, height: 32 })}
                        </div>
                        <p className="text-sm font-bold uppercase tracking-widest">No pending adjustments</p>
                    </div>
                )}
            </div>

            {/* New Adjustment Request Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="New Stock Adjustment Request"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Item Selection */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider">
                                Select Item *
                            </label>
                            <select
                                value={selectedItemId}
                                onChange={(e) => setSelectedItemId(e.target.value)}
                                className="w-full px-4 py-3 bg-card border-2 border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-foreground dark:border-slate-600"
                                required
                            >
                                <option value="">-- Select an item --</option>
                                {items.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.sku} - {item.name} (Current: {item.onHand} {item.unit})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Warehouse Selection */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider">
                                Warehouse *
                            </label>
                            <select
                                value={selectedWarehouseId}
                                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                                className="w-full px-4 py-3 bg-card border-2 border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-foreground dark:border-slate-600"
                                required
                            >
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>
                                        {wh.name} ({wh.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Adjustment Type */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider">
                                Adjustment Type *
                            </label>
                            <select
                                value={adjustmentType}
                                onChange={(e) => setAdjustmentType(e.target.value as 'Increase' | 'Decrease')}
                                className="w-full px-4 py-3 bg-card border-2 border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-foreground dark:border-slate-600"
                                required
                            >
                                <option value="Increase">Increase (+)</option>
                                <option value="Decrease">Decrease (-)</option>
                            </select>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider">
                                Quantity *
                            </label>
                            <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder="Enter quantity"
                                min="0.01"
                                step="0.01"
                                required
                                className="border-2 border-border dark:border-slate-600"
                            />
                        </div>

                        {/* Reason Code */}
                        <div>
                            <label className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider">
                                Reason Code *
                            </label>
                            <select
                                value={reasonCode}
                                onChange={(e) => setReasonCode(e.target.value)}
                                className="w-full px-4 py-3 bg-card border-2 border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-foreground dark:border-slate-600"
                                required
                            >
                                <option value="">-- Select reason --</option>
                                {reasonCodes.map(code => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                        </div>

                        {/* Notes */}
                        <div className="md:col-span-2">
                            <Textarea
                                label="Additional Notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Add any additional details about this adjustment..."
                                rows={3}
                                className="!border-2 !border-border dark:!border-slate-600"
                            />
                        </div>
                    </div>

                    {/* Summary Box */}
                    {selectedItemId && quantity && (
                        <div className={`p-4 rounded-xl border-2 ${adjustmentType === 'Increase' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60' : 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/60'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-foreground">
                                    {items.find(i => i.id === selectedItemId)?.name}
                                </span>
                                <span className={`text-xl font-black font-mono ${adjustmentType === 'Increase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {adjustmentType === 'Increase' ? '+' : '-'}{quantity} {items.find(i => i.id === selectedItemId)?.unit}
                                </span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Current stock: <span className="font-bold">{items.find(i => i.id === selectedItemId)?.onHand || 0}</span> →
                                New stock: <span className="font-bold">{(items.find(i => i.id === selectedItemId)?.onHand || 0) + (adjustmentType === 'Increase' ? 1 : -1) * parseFloat(quantity || '0')}</span>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className={`flex-1 ${adjustmentType === 'Increase' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                        >
                            Create Adjustment
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default StockAdjustments;

