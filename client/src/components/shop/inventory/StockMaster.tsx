
import React, { useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import { shopApi } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';

const StockMaster: React.FC = () => {
    const { items, warehouses, updateStock, requestTransfer, deleteItem, movements, updateItem } = useInventory();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const itemHistory = movements.filter(m => m.itemId === selectedItem?.id);
    const [editData, setEditData] = useState<any>(null);
    const [categories, setCategories] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await getShopCategoriesOfflineFirst();
                setCategories(res);
            } catch (err) {
                console.error('Failed to fetch categories:', err);
            }
        };
        fetchCategories();
    }, []);

    // Initialize edit data when selected item changes
    React.useEffect(() => {
        if (selectedItem) {
            setEditData({
                name: selectedItem.name,
                sku: selectedItem.sku,
                barcode: selectedItem.barcode || '',
                category: selectedItem.category,
                unit: selectedItem.unit,
                retailPrice: selectedItem.retailPrice,
                costPrice: selectedItem.costPrice,
                reorderPoint: selectedItem.reorderPoint,
                imageUrl: selectedItem.imageUrl
            });
            setImagePreview(selectedItem.imageUrl || null);
            console.log('🖼️ [StockMaster] Preview URL:', selectedItem.imageUrl);
            setSelectedImage(null);
        }
    }, [selectedItem]);

    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const handleDeleteSku = async () => {
        if (!selectedItem || selectedItem.id.startsWith('pending-')) return;
        const confirmed = window.confirm(
            `Are you sure you want to delete "${selectedItem.name}" (SKU: ${selectedItem.sku})? This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await deleteItem(selectedItem.id);
            setSelectedItem(null);
        } catch (e: any) {
            alert(e?.message ?? 'This SKU has been used in transactions. Please delete the transactions first if you want to delete the SKU.');
        } finally {
            setDeleting(false);
        }
    };

    const handleUpdateItem = async () => {
        if (!selectedItem || !editData) return;
        try {
            let imageUrl = editData.imageUrl;
            if (selectedImage) {
                const uploadRes = await shopApi.uploadImage(selectedImage);
                imageUrl = getFullImageUrl(uploadRes.imageUrl) || '';
            }

            await updateItem(selectedItem.id, { ...editData, imageUrl });
            setIsEditModalOpen(false);
            // Re-select item to refresh side panel
            const updated = items.find(i => i.id === selectedItem.id);
            if (updated) setSelectedItem({ ...updated, imageUrl });
        } catch (error) {
            console.error(error);
        }
    };

    const getMovementStyle = (type: string) => {
        switch (type) {
            case 'Sale': return 'bg-rose-100 text-rose-600';
            case 'Purchase': return 'bg-emerald-100 text-emerald-600';
            case 'Transfer': return 'bg-indigo-100 text-indigo-600';
            case 'Adjustment': return 'bg-amber-100 text-amber-600';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    const [transferData, setTransferData] = useState({
        sourceWarehouseId: '',
        destinationWarehouseId: '',
        quantity: 0,
        notes: ''
    });

    const [adjustData, setAdjustData] = useState({
        warehouseId: '',
        type: 'Increase' as 'Increase' | 'Decrease',
        quantity: 0,
        reason: ''
    });

    const handleTransfer = () => {
        if (!selectedItem) return;
        requestTransfer({
            sourceWarehouseId: transferData.sourceWarehouseId,
            destinationWarehouseId: transferData.destinationWarehouseId,
            items: [{
                itemId: selectedItem.id,
                quantity: Number(transferData.quantity),
                sku: selectedItem.sku,
                name: selectedItem.name
            }],
            requestedBy: 'admin-1', // Mock user
            notes: transferData.notes
        });
        setIsTransferModalOpen(false);
        setTransferData({ sourceWarehouseId: '', destinationWarehouseId: '', quantity: 0, notes: '' });
    };

    const handleAdjust = () => {
        if (!selectedItem) return;
        // Generate a random ID for reference
        const referenceId = `ADJ-${Date.now()}`;
        updateStock(
            selectedItem.id,
            adjustData.warehouseId,
            adjustData.type === 'Increase' ? Number(adjustData.quantity) : -Number(adjustData.quantity),
            'Adjustment',
            referenceId,
            adjustData.reason
        );
        setIsAdjustModalOpen(false);
        setAdjustData({ warehouseId: '', type: 'Increase', quantity: 0, reason: '' });
    };

    const filteredItems = items.filter(item => {
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch = !query ||
            item.name.toLowerCase().includes(query) ||
            item.sku.toLowerCase().includes(query) ||
            (item.barcode && item.barcode.toLowerCase().includes(query));
        const selectedCat = selectedCategoryId
            ? categories.find((c: any) => c.id === selectedCategoryId)
            : null;
        const matchesCategory =
            !selectedCategoryId ||
            item.category === selectedCategoryId ||
            (selectedCat && selectedCat.name === item.category);
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="flex gap-6 h-full max-h-full min-h-0 overflow-hidden relative">
            {/* Left: Item List - shrinks when detail panel is open */}
            <div className={`flex-1 min-w-0 flex flex-col gap-6 transition-[flex] duration-200 flex-shrink min-h-0`}>
                <div className="flex flex-wrap items-center gap-4 flex-shrink-0">
                    <div className="relative group flex-1 min-w-[200px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl leading-5 bg-card placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                            placeholder="Search SKU, Name or Barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <label htmlFor="stock-master-category" className="text-sm font-bold text-muted-foreground whitespace-nowrap">
                            Category:
                        </label>
                        <select
                            id="stock-master-category"
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            className="block rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-sm font-medium text-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 min-w-[180px]"
                        >
                            <option value="">All categories</option>
                            <option value="General">General</option>
                            {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <Card className="border-none shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                        <table className="w-full text-left">
                            <thead className="bg-muted/80 text-[10px] font-black uppercase text-muted-foreground sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 bg-muted/80">Item Details</th>
                                    <th className="px-6 py-4 bg-muted/80">Barcode</th>
                                    <th className="px-6 py-4 bg-muted/80">On Hand</th>
                                    <th className="px-6 py-4 bg-muted/80">Available</th>
                                    <th className="px-6 py-4 bg-muted/80">In Transit</th>
                                    <th className="px-6 py-4 bg-muted/80">Value (Retail)</th>
                                    <th className="px-6 py-4 bg-muted/80"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map(item => (
                                    <tr
                                        key={item.id}
                                        onClick={() => setSelectedItem(item)}
                                        className={`hover:bg-indigo-50/50 cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        React.cloneElement(ICONS.image as React.ReactElement, { size: 20, className: "text-slate-300" })
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-foreground text-sm">{item.name}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono italic">SKU: {item.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.barcode ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg w-fit border border-indigo-100">
                                                    <span className="text-xs font-mono font-bold">{item.barcode}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-[10px] italic">No Barcode</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black font-mono text-foreground">{item.onHand}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.available > 10 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                {item.available} {item.unit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-muted-foreground font-mono">{item.inTransit}</td>
                                        <td className="px-6 py-4 text-sm font-black text-foreground font-mono">
                                            {(item.onHand * item.retailPrice).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                                                {ICONS.chevronRight}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Right: Item Drill-down Side Panel - fixed width, no overlap */}
            {selectedItem && (
                <div className="flex-shrink-0 w-[420px] min-w-[360px] min-h-0 flex flex-col animate-slide-in-right">
                    <Card className="h-full min-h-0 border-none shadow-xl flex flex-col p-8 gap-8 overflow-y-auto bg-card border-l border-indigo-100 rounded-none rounded-l-3xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-black text-foreground">{selectedItem.name}</h2>
                                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mt-1">SKU ID: {selectedItem.sku}</p>
                                {selectedItem.barcode && (
                                    <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mt-0.5">📊 BARCODE: {selectedItem.barcode}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
                            >
                                {ICONS.x}
                            </button>
                        </div>

                        {/* Product Image Preview */}
                        <div className="w-full aspect-video rounded-3xl bg-muted/80 border border-border overflow-hidden flex items-center justify-center text-slate-200 shadow-inner">
                            {selectedItem.imageUrl ? (
                                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
                            ) : (
                                React.cloneElement(ICONS.image as React.ReactElement, { size: 64 })
                            )}
                        </div>

                        {/* Stock Distribution Matrix */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Inventory Distribution</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {warehouses.map(wh => (
                                    <div key={wh.id} className="flex items-center justify-between p-4 bg-muted/80 rounded-2xl border border-border group hover:border-indigo-200 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-muted-foreground shadow-sm border border-border group-hover:text-indigo-600">
                                                {ICONS.building}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-foreground">{wh.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{wh.code}</p>
                                            </div>
                                        </div>
                                        <div className="text-xl font-black text-foreground font-mono">
                                            {selectedItem.warehouseStock[wh.id] || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Financial Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100">
                                <p className="text-[10px] font-bold uppercase opacity-80">Retail Price</p>
                                <p className="text-xl font-black font-mono mt-1">{CURRENCY} {selectedItem.retailPrice}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-100">
                                <p className="text-[10px] font-bold uppercase opacity-80">Cost Price</p>
                                <p className="text-xl font-black font-mono mt-1">{CURRENCY} {selectedItem.costPrice}</p>
                            </div>
                        </div>

                        {/* Inventory Controls */}
                        <div className="space-y-4 mt-auto">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsTransferModalOpen(true)}
                                    className="flex-1 py-4 bg-card border-2 border-border text-foreground rounded-2xl font-black text-xs hover:border-indigo-600 hover:text-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Transfer
                                </button>
                                <button
                                    onClick={() => setIsAdjustModalOpen(true)}
                                    className="flex-1 py-4 bg-card border-2 border-border text-foreground rounded-2xl font-black text-xs hover:border-indigo-600 hover:text-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Adjust
                                </button>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs hover:bg-indigo-100 transition-all uppercase tracking-widest shadow-sm border border-indigo-100 mb-3"
                            >
                                Edit Product Details
                            </button>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="w-full py-4 bg-muted/80 text-muted-foreground rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-dashed border-border hover:bg-muted transition-all"
                            >
                                View Full Card History
                            </button>
                            {!selectedItem.id.startsWith('pending-') && (
                                <button
                                    type="button"
                                    onClick={handleDeleteSku}
                                    disabled={deleting}
                                    className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-200 hover:bg-red-100 transition-all disabled:opacity-50"
                                >
                                    {deleting ? 'Deleting...' : 'Delete SKU'}
                                </button>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* History Modal */}
            <Modal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                title={`Stock Card - ${selectedItem?.name}`}
                size="lg"
            >
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Bin Card History</p>
                            <h4 className="text-sm font-bold text-muted-foreground mt-1">Audit Trail for {selectedItem?.sku}</h4>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Current Balance</p>
                            <p className="text-lg font-black text-indigo-600 font-mono italic">{selectedItem?.onHand} {selectedItem?.unit}</p>
                        </div>
                    </div>

                    <div className="border border-border rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-muted/80 text-[10px] font-black uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Event</th>
                                    <th className="px-6 py-4">Warehouse</th>
                                    <th className="px-6 py-4 text-center">Qty</th>
                                    <th className="px-6 py-4 text-right">Reference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {itemHistory.length > 0 ? itemHistory.map(move => (
                                    <tr key={move.id} className="hover:bg-muted/50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs font-bold text-foreground">
                                                {new Date(move.timestamp).toLocaleDateString()}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground font-mono">
                                                {new Date(move.timestamp).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${getMovementStyle(move.type)}`}>
                                                {move.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-muted-foreground">
                                            {warehouses.find(w => w.id === move.warehouseId)?.name || '---'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-black font-mono ${move.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {move.quantity > 0 ? '+' : ''}{move.quantity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-[10px] font-mono font-bold bg-muted text-muted-foreground p-1 rounded uppercase">
                                                {move.referenceId.slice(0, 8)}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic text-sm">
                                            No historical transactions found for this item.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Transfer Modal */}
            <Modal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                title={`Transfer Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Source Warehouse"
                            value={transferData.sourceWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, sourceWarehouseId: e.target.value })}
                        >
                            <option value="">Select Source</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                        <Select
                            label="Destination Warehouse"
                            value={transferData.destinationWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, destinationWarehouseId: e.target.value })}
                        >
                            <option value="">Select Destination</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                    </div>
                    <Input
                        label="Quantity"
                        type="number"
                        value={transferData.quantity}
                        onChange={(e) => setTransferData({ ...transferData, quantity: Number(e.target.value) })}
                    />
                    <Input
                        label="Notes"
                        placeholder="Reason for transfer..."
                        value={transferData.notes}
                        onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleTransfer} disabled={!transferData.sourceWarehouseId || !transferData.destinationWarehouseId || !transferData.quantity}>
                            Confirm Transfer
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Adjustment Modal */}
            <Modal
                isOpen={isAdjustModalOpen}
                onClose={() => setIsAdjustModalOpen(false)}
                title={`Adjust Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <Select
                        label="Warehouse"
                        value={adjustData.warehouseId}
                        onChange={(e) => setAdjustData({ ...adjustData, warehouseId: e.target.value })}
                    >
                        <option value="">Select Warehouse</option>
                        {warehouses.map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Adjustment Type"
                            value={adjustData.type}
                            onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value as any })}
                        >
                            <option value="Increase">Increase (+)</option>
                            <option value="Decrease">Decrease (-)</option>
                        </Select>
                        <Input
                            label="Quantity"
                            type="number"
                            value={adjustData.quantity}
                            onChange={(e) => setAdjustData({ ...adjustData, quantity: Number(e.target.value) })}
                        />
                    </div>
                    <Input
                        label="Reason"
                        placeholder="Broken, Found, Gift, etc."
                        value={adjustData.reason}
                        onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAdjust} disabled={!adjustData.warehouseId || !adjustData.quantity}>
                            Confirm Adjustment
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Product Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={`Edit Product - ${selectedItem?.name}`}
            >
                {editData && (
                    <div className="space-y-4">
                        <Input
                            label="Product Name"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        />
                        <Select
                            label="Category"
                            value={editData.category || 'General'}
                            onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                        >
                            <option value="General">General</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </Select>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="SKU"
                                value={editData.sku}
                                onChange={(e) => setEditData({ ...editData, sku: e.target.value })}
                            />
                            <Input
                                label="Barcode"
                                value={editData.barcode}
                                onChange={(e) => setEditData({ ...editData, barcode: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Retail Price"
                                type="number"
                                value={editData.retailPrice}
                                onChange={(e) => setEditData({ ...editData, retailPrice: Number(e.target.value) })}
                            />
                            <Input
                                label="Cost Price"
                                type="number"
                                value={editData.costPrice}
                                onChange={(e) => setEditData({ ...editData, costPrice: Number(e.target.value) })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Unit"
                                value={editData.unit}
                                onChange={(e) => setEditData({ ...editData, unit: e.target.value })}
                            />
                            <Input
                                label="Reorder Point"
                                type="number"
                                value={editData.reorderPoint}
                                onChange={(e) => setEditData({ ...editData, reorderPoint: Number(e.target.value) })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">Product Image</label>
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-2xl bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden text-slate-300">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        React.cloneElement(ICONS.image as React.ReactElement, { size: 32 })
                                    )}
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setSelectedImage(file);
                                                setImagePreview(URL.createObjectURL(file));
                                            }
                                        }}
                                        className="hidden"
                                        id="sku-image-edit-upload"
                                    />
                                    <label
                                        htmlFor="sku-image-edit-upload"
                                        className="inline-flex items-center px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
                                    >
                                        {imagePreview ? 'Change Image' : 'Upload Image'}
                                    </label>
                                    <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">JPG, PNG or WEBP (Max 2MB)</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleUpdateItem}>Save Changes</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StockMaster;
