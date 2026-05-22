import React from 'react';
import { motion } from 'framer-motion';
import Button from '../../../../ui/Button';
import { ICONS } from '../../../../../constants';

interface Props {
    onSearch: () => void;
    onAddNew: () => void;
    onClose: () => void;
}

export function ChoiceScreen({ onSearch, onAddNew, onClose }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 p-1"
        >
            <p className="text-sm text-slate-600">
                Product not found. Search an existing SKU to edit, or create a new catalog item.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={onSearch}
                    className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-100">
                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 26 })}
                    </div>
                    <div>
                        <span className="block text-base font-semibold text-slate-900">Search existing SKU</span>
                        <span className="mt-1 block text-sm text-slate-500">
                            Find and edit — add barcode, pricing, or image
                        </span>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={onAddNew}
                    className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
                >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                        {React.cloneElement(ICONS.plus as React.ReactElement, { size: 26 })}
                    </div>
                    <div>
                        <span className="block text-base font-semibold text-slate-900">Add new SKU</span>
                        <span className="mt-1 block text-sm text-slate-500">
                            Create a new product in your inventory catalog
                        </span>
                    </div>
                </button>
            </div>
            <div className="flex justify-end">
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
            </div>
        </motion.div>
    );
}
