
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import { InventoryItem } from '../../../types/inventory';

function itemPickerLabel(item: InventoryItem) {
    return `${item.sku} - ${item.name} (Current: ${item.onHand} ${item.unit})`;
}

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

    const [itemPickerOpen, setItemPickerOpen] = useState(false);
    const [itemQuery, setItemQuery] = useState('');
    const [itemHighlight, setItemHighlight] = useState(0);
    const itemPickerRef = useRef<HTMLDivElement>(null);

    const normalizedQuery = itemQuery.trim().toLowerCase();
    const filteredItems = useMemo(() => {
        if (!normalizedQuery) return items;
        return items.filter((item) => {
            const sku = (item.sku || '').toLowerCase();
            const name = (item.name || '').toLowerCase();
            const barcode = (item.barcode || '').toLowerCase();
            return (
                sku.includes(normalizedQuery) ||
                name.includes(normalizedQuery) ||
                barcode.includes(normalizedQuery)
            );
        });
    }, [items, normalizedQuery]);

    const selectedInventoryItem = useMemo(
        () => (selectedItemId ? items.find((i) => i.id === selectedItemId) : undefined),
        [items, selectedItemId]
    );

    useEffect(() => {
        setItemHighlight(0);
    }, [normalizedQuery, itemPickerOpen]);

    useEffect(() => {
        if (!itemPickerOpen) return;
        const onDocMouseDown = (e: MouseEvent) => {
            const el = itemPickerRef.current;
            if (el && !el.contains(e.target as Node)) {
                setItemPickerOpen(false);
                setItemQuery('');
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [itemPickerOpen]);

    const selectInventoryItem = useCallback((item: InventoryItem) => {
        setSelectedItemId(item.id);
        setItemPickerOpen(false);
        setItemQuery('');
    }, []);

    const handleOpenModal = () => {
        // Reset form
        setSelectedItemId('');
        setSelectedWarehouseId(warehouses[0]?.id || '');
        setAdjustmentType('Increase');
        setQuantity('');
        setReasonCode('');
        setNotes('');
        setItemPickerOpen(false);
        setItemQuery('');
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
                <h3 className="text-lg font-semibold text-foreground tracking-tight">Adjustment Approval Queue</h3>
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
                                <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-widest ${adj.status === 'Approved' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                                    }`}>
                                    {adj.status}
                                </span>
                            </div>

                            <div className="space-y-1 mb-6">
                                <h4 className="font-semibold text-foreground tracking-tight">{item?.name || 'Unknown Item'}</h4>
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                                    {warehouse?.name} • Reason: {adj.reasonCode}
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border shadow-sm mb-6">
                                <span className="text-xs font-bold text-muted-foreground">Adjustment Qty</span>
                                <span className={`text-xl font-semibold font-mono ${adj.type === 'Increase' ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                    {adj.type === 'Increase' ? '+' : '-'}{adj.quantity}
                                </span>
                            </div>

                            {adj.status === 'Pending' ? (
                                <button
                                    onClick={() => approveAdjustment(adj.id)}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-semibold uppercase tracking-widest hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all"
                                >
                                    Approve & Commit
                                </button>
                            ) : (
                                <div className="text-xs text-muted-foreground font-medium italic text-center">
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
                        {/* Item Selection — searchable combobox */}
                        <div className="md:col-span-2" ref={itemPickerRef}>
                            <label
                                htmlFor="stock-adjust-item"
                                className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider"
                            >
                                Select Item *
                            </label>
                            <div className="relative">
                                <input
                                    id="stock-adjust-item"
                                    type="text"
                                    autoComplete="off"
                                    role="combobox"
                                    aria-expanded={itemPickerOpen ? 'true' : 'false'}
                                    aria-controls={
                                        itemPickerOpen && filteredItems.length > 0
                                            ? 'stock-adjust-item-listbox'
                                            : undefined
                                    }
                                    aria-activedescendant={
                                        itemPickerOpen && filteredItems[itemHighlight]
                                            ? `stock-adjust-item-opt-${filteredItems[itemHighlight].id}`
                                            : undefined
                                    }
                                    placeholder="Search by name, SKU, or barcode…"
                                    value={
                                        itemPickerOpen
                                            ? itemQuery
                                            : selectedInventoryItem
                                              ? itemPickerLabel(selectedInventoryItem)
                                              : ''
                                    }
                                    onChange={(e) => {
                                        setItemQuery(e.target.value);
                                        setItemPickerOpen(true);
                                        if (selectedItemId) setSelectedItemId('');
                                    }}
                                    onFocus={() => {
                                        setItemPickerOpen(true);
                                        setItemQuery('');
                                    }}
                                    onKeyDown={(e) => {
                                        if (!itemPickerOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                                            setItemPickerOpen(true);
                                            setItemQuery('');
                                            e.preventDefault();
                                            return;
                                        }
                                        if (!itemPickerOpen) return;
                                        if (e.key === 'Escape') {
                                            setItemPickerOpen(false);
                                            setItemQuery('');
                                            e.preventDefault();
                                            return;
                                        }
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setItemHighlight((h) =>
                                                filteredItems.length ? (h + 1) % filteredItems.length : 0
                                            );
                                            return;
                                        }
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setItemHighlight((h) =>
                                                filteredItems.length
                                                    ? (h - 1 + filteredItems.length) % filteredItems.length
                                                    : 0
                                            );
                                            return;
                                        }
                                        if (e.key === 'Enter' && filteredItems[itemHighlight]) {
                                            e.preventDefault();
                                            selectInventoryItem(filteredItems[itemHighlight]);
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-card border-2 border-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-foreground dark:border-slate-600"
                                />
                                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                        <path
                                            fillRule="evenodd"
                                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                {itemPickerOpen &&
                                    (filteredItems.length === 0 ? (
                                        <div className="absolute z-50 mt-1 w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg dark:border-slate-600">
                                            No items match your search.
                                        </div>
                                    ) : (
                                        <div
                                            id="stock-adjust-item-listbox"
                                            role="listbox"
                                            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border-2 border-border bg-card py-1 shadow-lg dark:border-slate-600"
                                        >
                                            {filteredItems.map((item, idx) => (
                                                <div
                                                    key={item.id}
                                                    id={`stock-adjust-item-opt-${item.id}`}
                                                    role="option"
                                                    aria-selected={selectedItemId === item.id}
                                                    className={`cursor-pointer px-4 py-2.5 text-sm ${
                                                        idx === itemHighlight
                                                            ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                                                            : 'text-foreground hover:bg-muted/80'
                                                    }`}
                                                    onMouseEnter={() => setItemHighlight(idx)}
                                                    onMouseDown={(ev) => {
                                                        ev.preventDefault();
                                                        selectInventoryItem(item);
                                                    }}
                                                >
                                                    {itemPickerLabel(item)}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                            </div>
                            {!selectedItemId && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Type to filter products, then choose from the list.
                                </p>
                            )}
                        </div>

                        {/* Warehouse Selection */}
                        <div>
                            <label
                                htmlFor="stock-adjust-warehouse"
                                className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider"
                            >
                                Warehouse *
                            </label>
                            <select
                                id="stock-adjust-warehouse"
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
                            <label
                                htmlFor="stock-adjust-type"
                                className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider"
                            >
                                Adjustment Type *
                            </label>
                            <select
                                id="stock-adjust-type"
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
                            <label
                                htmlFor="stock-adjust-reason"
                                className="block text-xs font-bold text-foreground mb-2 uppercase tracking-wider"
                            >
                                Reason Code *
                            </label>
                            <select
                                id="stock-adjust-reason"
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
                                <span className={`text-xl font-semibold font-mono ${adjustmentType === 'Increase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
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

