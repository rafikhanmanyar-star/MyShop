import React from 'react';
import { motion } from 'framer-motion';

interface SkuCardProps {
    id?: string;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    className?: string;
}

export function SkuCard({ id, title, subtitle, children, className = '' }: SkuCardProps) {
    return (
        <motion.section
            id={id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}
        >
            <header className="mb-4">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
            </header>
            {children}
        </motion.section>
    );
}

export function SkuLabel({
    htmlFor,
    children,
    hint
}: {
    htmlFor?: string;
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <div className="space-y-1">
            <label
                htmlFor={htmlFor}
                className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
                {children}
            </label>
            {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
        </div>
    );
}

export function SkuTextInput({
    id,
    value,
    onChange,
    placeholder,
    readOnly,
    disabled,
    type = 'text',
    maxLength,
    error
}: {
    id?: string;
    value: string | number;
    onChange?: (v: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    disabled?: boolean;
    type?: string;
    maxLength?: number;
    error?: string;
}) {
    return (
        <div>
            <input
                id={id}
                type={type}
                value={value}
                readOnly={readOnly}
                disabled={disabled}
                maxLength={maxLength}
                placeholder={placeholder}
                onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                className={`block w-full rounded-xl border bg-white py-2.5 px-3 text-sm text-slate-900 shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-violet-500/20 ${
                    error
                        ? 'border-rose-300 focus:border-rose-500'
                        : 'border-slate-200 focus:border-violet-500'
                } ${readOnly || disabled ? 'cursor-not-allowed bg-slate-50 text-slate-600' : ''}`}
            />
            {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
        </div>
    );
}

export function SkuToggle({
    checked,
    onChange,
    label,
    description
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                <span className="text-sm font-medium text-slate-800">{label}</span>
                {description ? <p className="text-xs text-slate-500">{description}</p> : null}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                    checked ? 'bg-violet-600' : 'bg-slate-300'
                }`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        checked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
            </button>
        </div>
    );
}
