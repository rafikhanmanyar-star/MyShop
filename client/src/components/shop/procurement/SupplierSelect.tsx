import React, { useRef } from 'react';
import { UserPlus } from 'lucide-react';

export type VendorOption = {
  id: string;
  name: string;
  company_name?: string;
  companyName?: string;
};

function vendorLabel(v: VendorOption): string {
  const co = v.company_name ?? v.companyName;
  return co ? `${v.name} (${co})` : v.name;
}

export interface SupplierSelectProps {
  vendors: VendorOption[];
  supplierId: string;
  vendorSearch: string;
  vendorDisplayName: string;
  vendorDropdownOpen: boolean;
  /** Focus supplier field when opening create form (ERP data entry flow). */
  autoFocus?: boolean;
  disabled?: boolean;
  loadingData?: boolean;
  onVendorSearchChange: (q: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (v: VendorOption) => void;
  onAddSupplier: () => void;
}

export default function SupplierSelect({
  vendors,
  supplierId,
  vendorSearch,
  vendorDisplayName,
  vendorDropdownOpen,
  autoFocus,
  disabled,
  loadingData,
  onVendorSearchChange,
  onOpenChange,
  onSelect,
  onAddSupplier,
}: SupplierSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = vendors.filter(
    (v) =>
      !vendorSearch ||
      v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      (v.company_name ?? v.companyName ?? '').toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const inputValue = vendorDropdownOpen ? vendorSearch : vendorDisplayName || vendorSearch;

  return (
    <div ref={containerRef} className="relative space-y-1">
      <div className="flex items-end justify-between gap-2">
        <label className="label">Supplier / Vendor *</label>
        <button
          type="button"
          onClick={() => {
            onAddSupplier();
            onOpenChange(false);
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-all duration-200 hover:bg-accent disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Supplier
        </button>
      </div>
      <input
        type="text"
        value={inputValue}
        autoFocus={autoFocus}
        onChange={(e) => {
          if (disabled) return;
          onVendorSearchChange(e.target.value);
          onOpenChange(true);
        }}
        onFocus={() => !disabled && onOpenChange(true)}
        onBlur={(e) => {
          if (containerRef.current?.contains(e.relatedTarget as Node)) return;
          onOpenChange(false);
          if (!supplierId && vendorSearch !== vendorDisplayName) onVendorSearchChange('');
          if (supplierId && !vendorSearch) onVendorSearchChange(vendorDisplayName);
        }}
        placeholder="Search supplier by name or company..."
        readOnly={disabled}
        className={`input input-text py-2 transition-all duration-200 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-80 ${
          disabled ? '' : ''
        }`}
      />
      {vendorDropdownOpen && !disabled && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-erp-md custom-scrollbar">
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              {vendorSearch ? `No supplier matching "${vendorSearch}"` : 'Type to search'}
            </li>
          ) : (
            filtered.slice(0, 20).map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(v)}
                  className="w-full border-b border-border px-3 py-2.5 text-left text-sm text-foreground transition-all duration-200 last:border-0 hover:bg-accent"
                >
                  {vendorLabel(v)}
                </button>
              </li>
            ))
          )}
          <li className="border-t border-border">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAddSupplier();
                onOpenChange(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-primary transition-all duration-200 hover:bg-accent"
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              Add new vendor
            </button>
          </li>
        </ul>
      )}
      {!loadingData && vendors.length === 0 && (
        <p className="text-xs text-warning">No vendors yet. Add one with &quot;Add Supplier&quot; or in Settings.</p>
      )}
    </div>
  );
}
