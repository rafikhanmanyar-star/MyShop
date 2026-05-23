import React from 'react';
import { motion } from 'framer-motion';
import CachedImage from '../../../../ui/CachedImage';
import { ICONS } from '../../../../../constants';
import type { SkuFormStatus, SkuSectionId } from '../types';
import { SKU_SECTIONS } from '../types';

interface Props {
    title: string;
    sku: string;
    status: SkuFormStatus;
    imagePreview: string | null;
    activeSection: SkuSectionId;
    onSectionClick: (id: SkuSectionId) => void;
    onBack: () => void;
    onClose: () => void;
    onDuplicate?: () => void;
    onArchive?: () => void;
    backLabel?: string;
    isEditing: boolean;
}

const statusStyles: Record<SkuFormStatus, string> = {
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    archived: 'bg-amber-100 text-amber-900 border-amber-200'
};

export function ModalHeader({
    title,
    sku,
    status,
    imagePreview,
    activeSection,
    onSectionClick,
    onBack,
    onClose,
    onDuplicate,
    onArchive,
    backLabel = 'Back',
    isEditing
}: Props) {
    const sectionIndex = SKU_SECTIONS.findIndex((s) => s.id === activeSection);

    return (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                        {React.cloneElement(ICONS.chevronLeft as React.ReactElement, { size: 18 })}
                        {backLabel}
                    </button>
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                        {imagePreview ? (
                            imagePreview.startsWith('blob:') ? (
                                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <CachedImage path={imagePreview} alt="" className="h-full w-full object-cover" />
                            )
                        ) : (
                            <div className="flex h-full items-center justify-center text-slate-400">
                                {React.cloneElement(ICONS.package as React.ReactElement, { size: 22 })}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h1>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">{sku || '—'}</span>
                            <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyles[status]}`}
                            >
                                {status}
                            </span>
                        </div>
                    </div>
                </div>

                <nav
                    className="hidden flex-1 items-center justify-center gap-1 lg:flex"
                    aria-label="Form sections"
                >
                    {SKU_SECTIONS.map((s, i) => (
                        <React.Fragment key={s.id}>
                            <button
                                type="button"
                                onClick={() => onSectionClick(s.id)}
                                className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                                    activeSection === s.id
                                        ? 'bg-violet-100 text-violet-800'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {s.label}
                            </button>
                            {i < SKU_SECTIONS.length - 1 ? (
                                <span className="text-slate-300">→</span>
                            ) : null}
                        </React.Fragment>
                    ))}
                </nav>

                <div className="flex shrink-0 items-center gap-1">
                    {isEditing && onDuplicate ? (
                        <button
                            type="button"
                            onClick={onDuplicate}
                            className="hidden rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 sm:inline"
                        >
                            Duplicate
                        </button>
                    ) : null}
                    {isEditing && onArchive ? (
                        <button
                            type="button"
                            onClick={onArchive}
                            className="hidden rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 sm:inline"
                        >
                            Archive
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                    >
                        {React.cloneElement(ICONS.x as React.ReactElement, { size: 20 })}
                    </button>
                </div>
            </div>

            <div className="mt-3 lg:hidden">
                <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                        className="h-full bg-violet-600"
                        initial={false}
                        animate={{
                            width: `${((sectionIndex + 1) / SKU_SECTIONS.length) * 100}%`
                        }}
                        transition={{ duration: 0.25 }}
                    />
                </div>
            </div>
        </header>
    );
}
