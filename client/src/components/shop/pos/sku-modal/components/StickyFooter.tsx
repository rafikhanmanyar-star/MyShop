import React from 'react';
import { motion } from 'framer-motion';
import Button from '../../../../ui/Button';

interface Props {
    isDirty: boolean;
    lastAutosave: Date | null;
    saving: boolean;
    deleting: boolean;
    canSave: boolean;
    isEditing: boolean;
    onCancel: () => void;
    onSaveDraft: () => void;
    onSave: () => void;
    onArchive?: () => void;
}

export function StickyFooter({
    isDirty,
    lastAutosave,
    saving,
    deleting,
    canSave,
    isEditing,
    onCancel,
    onSaveDraft,
    onSave,
    onArchive
}: Props) {
    return (
        <footer className="sticky bottom-0 z-20 border-t border-slate-200/90 bg-white/90 px-4 py-3 shadow-[0_-8px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-md sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    {isDirty ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            Unsaved changes
                        </span>
                    ) : (
                        <span>All changes saved</span>
                    )}
                    {lastAutosave ? (
                        <span className="text-slate-400">
                            · Autosaved {lastAutosave.toLocaleTimeString()}
                        </span>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {onArchive && isEditing ? (
                        <button
                            type="button"
                            onClick={onArchive}
                            disabled={saving || deleting}
                            className="mr-auto text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 sm:mr-0"
                        >
                            {deleting ? 'Archiving…' : 'Archive SKU'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving || deleting}
                        className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSaveDraft}
                        disabled={saving}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Save draft
                    </button>
                    <motion.div whileTap={{ scale: 0.98 }}>
                        <Button
                            onClick={onSave}
                            disabled={!canSave || saving || deleting}
                            className="min-w-[140px] rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
                        >
                            {saving ? (
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Saving…
                                </span>
                            ) : isEditing ? (
                                'Save SKU'
                            ) : (
                                'Create SKU'
                            )}
                        </Button>
                    </motion.div>
                </div>
            </div>
        </footer>
    );
}
