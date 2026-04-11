import React, { useRef } from 'react';
import { PackagePlus, Search } from 'lucide-react';

export type ProductOption = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  cost_price?: number;
  costPrice?: number;
  average_cost?: number;
};

export interface ProductSearchInputProps {
  currencyLabel: string;
  productSearch: string;
  dropdownOpen: boolean;
  products: ProductOption[];
  loadingData?: boolean;
  onSearchChange: (q: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (p: ProductOption) => void;
  onAddSku: () => void;
  onEnterAdd?: (p: ProductOption) => void;
}

export default function ProductSearchInput({
  currencyLabel,
  productSearch,
  dropdownOpen,
  products,
  loadingData,
  onSearchChange,
  onOpenChange,
  onSelectProduct,
  onAddSku,
  onEnterAdd,
}: ProductSearchInputProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = products.filter(
    (p) =>
      !productSearch ||
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcode &&
        (p.barcode === productSearch.trim() || p.barcode.toLowerCase().includes(productSearch.trim().toLowerCase())))
  );

  const exactBarcode =
    productSearch.trim() && products.find((p) => p.barcode && p.barcode.trim() === productSearch.trim());
  const singleMatch = filtered.length === 1 ? filtered[0] : null;
  const enterTarget = exactBarcode ?? singleMatch;

  return (
    <div ref={wrapRef} className="relative space-y-0.5">
      <label className="label mb-0.5 block">Add products</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={productSearch}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onOpenChange(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && enterTarget && onEnterAdd) {
              e.preventDefault();
              onEnterAdd(enterTarget);
              onOpenChange(false);
              return;
            }
            if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              onOpenChange(true);
            }
          }}
          onClick={() => onOpenChange(true)}
          onBlur={(e) => {
            if (wrapRef.current?.contains(e.relatedTarget as Node)) return;
            onOpenChange(false);
          }}
          placeholder="Search product, SKU, or scan barcode..."
          className="input input-text py-2 pl-9 pr-3 transition-all duration-200 placeholder:text-muted-foreground"
        />
      </div>
      <p className="hidden text-xs leading-snug text-muted-foreground md:block">
        Same catalog as Stock Master. Press Enter when one product matches or barcode scans.
      </p>
      {!loadingData && products.length === 0 && (
        <p className="text-xs text-warning">No products yet. Add SKUs in Inventory first.</p>
      )}
      {dropdownOpen && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-erp-md custom-scrollbar">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              {productSearch ? `No products matching "${productSearch}"` : 'Type name, SKU, or scan barcode'}
            </li>
          ) : (
            filtered.slice(0, 15).map((p) => {
              const cost = Number(p.cost_price ?? p.costPrice ?? p.average_cost ?? 0);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectProduct(p);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-start justify-between gap-2 border-b border-border px-3 py-2.5 text-left transition-all duration-200 last:border-0 hover:bg-accent"
                  >
                    <span>
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">SKU: {p.sku || '—'}</span>
                      {p.barcode && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground/80">Barcode: {p.barcode}</span>
                      )}
                    </span>
                    <span className="numeric-data shrink-0 text-sm font-semibold text-primary">
                      {currencyLabel} {cost.toLocaleString()}
                    </span>
                  </button>
                </li>
              );
            })
          )}
          <li className="border-t border-border">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAddSku();
                onOpenChange(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-primary transition-all duration-200 hover:bg-accent"
            >
              <PackagePlus className="h-4 w-4 shrink-0" />
              Add new SKU{productSearch.trim() ? `: "${productSearch.trim()}"` : ''}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
