import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { SkuComboOption } from './types';

const SkuSearchableCombo: React.FC<{
    id: string;
    ariaDescribedBy?: string;
    disabled?: boolean;
    disabledDisplay?: string;
    value: string;
    options: SkuComboOption[];
    onValueChange: (next: string) => void;
    searchPlaceholder?: string;
}> = ({
    id,
    ariaDescribedBy,
    disabled,
    disabledDisplay,
    value,
    options,
    onValueChange,
    searchPlaceholder
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxId = `${id}-listbox`;

    const selectedLabel = useMemo(
        () => options.find((o) => o.value === value)?.label ?? '',
        [options, value]
    );

    const qNorm = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!qNorm) return options;
        return options.filter((o) => o.label.toLowerCase().includes(qNorm));
    }, [options, qNorm]);

    useEffect(() => {
        setHighlight(0);
    }, [qNorm, open, filtered.length]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (disabled) {
        return (
            <input
                id={id}
                type="text"
                readOnly
                disabled
                aria-describedby={ariaDescribedBy}
                value={disabledDisplay ?? ''}
                className="block w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-sm text-slate-500"
            />
        );
    }

    const selectAt = (idx: number) => {
        const opt = filtered[idx];
        if (!opt) return;
        onValueChange(opt.value);
        setOpen(false);
        setQuery('');
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                id={id}
                type="text"
                autoComplete="off"
                role="combobox"
                aria-expanded={open ? 'true' : 'false'}
                aria-controls={open && filtered.length > 0 ? listboxId : undefined}
                aria-activedescendant={
                    open && filtered[highlight] ? `${id}-opt-${highlight}` : undefined
                }
                aria-describedby={ariaDescribedBy}
                placeholder={searchPlaceholder}
                value={open ? query : selectedLabel}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => {
                    setOpen(true);
                    setQuery('');
                }}
                onKeyDown={(e) => {
                    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                        setOpen(true);
                        setQuery('');
                        e.preventDefault();
                        return;
                    }
                    if (!open) return;
                    if (e.key === 'Escape') {
                        setOpen(false);
                        setQuery('');
                        e.preventDefault();
                        return;
                    }
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlight((h) => (filtered.length ? (h + 1) % filtered.length : 0));
                        return;
                    }
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlight((h) =>
                            filtered.length ? (h - 1 + filtered.length) % filtered.length : 0
                        );
                        return;
                    }
                    if (e.key === 'Enter' && filtered[highlight]) {
                        e.preventDefault();
                        selectAt(highlight);
                    }
                }}
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 pr-9 text-sm text-slate-900 shadow-sm transition-shadow focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                    />
                </svg>
            </div>
            {open &&
                (filtered.length === 0 ? (
                    <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-xl">
                        No matching options.
                    </div>
                ) : (
                    <ul
                        id={listboxId}
                        role="listbox"
                        className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl"
                    >
                        {filtered.map((opt, idx) => (
                            <li
                                key={`${opt.value}-${idx}`}
                                id={`${id}-opt-${idx}`}
                                role="option"
                                aria-selected={idx === highlight ? 'true' : 'false'}
                                className={`cursor-pointer px-3 py-2 ${
                                    idx === highlight
                                        ? 'bg-violet-50 text-violet-900'
                                        : 'text-slate-800 hover:bg-slate-50'
                                }`}
                                onMouseEnter={() => setHighlight(idx)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectAt(idx);
                                }}
                            >
                                {opt.label}
                            </li>
                        ))}
                    </ul>
                ))}
        </div>
    );
};

export default SkuSearchableCombo;
