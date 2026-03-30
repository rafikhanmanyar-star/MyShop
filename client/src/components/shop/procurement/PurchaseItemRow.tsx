import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';

export interface LineItem {
  productId: string;
  quantity: number;
  unitCost: number;
  taxAmount: number;
  subtotal: number;
}

export interface PurchaseItemRowProps {
  line: LineItem;
  productName: string;
  currencyLabel: string;
  stock: number | null;
  reorderPoint?: number;
  onQuantityChange: (qty: number) => void;
  onUnitCostChange: (cost: number) => void;
  onRemove: () => void;
  zebra?: boolean;
}

export default function PurchaseItemRow({
  line,
  productName,
  currencyLabel,
  stock,
  reorderPoint = 0,
  onQuantityChange,
  onUnitCostChange,
  onRemove,
  zebra,
}: PurchaseItemRowProps) {
  const qty = Math.max(1, Math.floor(line.quantity));
  const low = stock != null && stock <= reorderPoint;
  const good = stock != null && stock > reorderPoint;

  return (
    <>
      <tr
        className={`hidden border-b border-border transition-all duration-200 md:table-row ${
          zebra ? 'bg-table-zebra' : ''
        } hover:bg-table-row-hover`}
      >
        <td className="body-text px-4 py-3 font-medium">{productName}</td>
        <td className="px-4 py-3">
          {stock != null ? (
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                good ? 'bg-emerald-500/15 text-success' : 'bg-muted/800/15 text-muted-foreground'
              }`}
            >
              {low ? 'Low ' : ''}
              <span className="tabular-nums">{Number(stock).toLocaleString()}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="inline-flex items-center rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => onQuantityChange(Math.max(1, qty - 1))}
              className="rounded-l-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-primary active:scale-[0.98]"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => onQuantityChange(Math.max(1, Math.floor(parseFloat(e.target.value) || 0)))}
              className="input-text w-14 border-x border-border bg-transparent py-1.5 text-center font-medium tabular-nums text-foreground [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => onQuantityChange(qty + 1)}
              className="rounded-r-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-primary active:scale-[0.98]"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <input
            type="number"
            min={0}
            step={0.01}
            value={line.unitCost}
            onChange={(e) => onUnitCostChange(parseFloat(e.target.value) || 0)}
            className="input input-text w-28 rounded-lg px-2 py-1.5 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </td>
        <td className="numeric-data px-4 py-3 text-right text-sm font-semibold">
          {currencyLabel} {line.subtotal.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-2 text-destructive transition-all duration-200 hover:bg-red-500/10 active:scale-[0.98]"
            aria-label="Remove line"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>

      <tr className="md:hidden">
        <td colSpan={6} className="border-b border-border p-0">
          <div
            className={`rounded-xl border border-border bg-card p-4 shadow-erp ${zebra ? 'bg-table-zebra' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="body-text font-semibold">{productName}</p>
                {stock != null && (
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                      good ? 'bg-emerald-500/15 text-success' : 'bg-muted/800/15 text-muted-foreground'
                    }`}
                  >
                    Stock <span className="tabular-nums">{Number(stock).toLocaleString()}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg p-1.5 text-destructive hover:bg-red-500/10"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Quantity</span>
                <div className="mt-1 inline-flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => onQuantityChange(Math.max(1, qty - 1))}
                    className="rounded-l-lg p-2 hover:bg-accent"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    className="w-12 border-x border-border bg-transparent py-1 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    value={qty}
                    onChange={(e) => onQuantityChange(Math.max(1, Math.floor(parseFloat(e.target.value) || 0)))}
                  />
                  <button
                    type="button"
                    onClick={() => onQuantityChange(qty + 1)}
                    className="rounded-r-lg p-2 hover:bg-accent"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Unit cost</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={line.unitCost}
                  onChange={(e) => onUnitCostChange(parseFloat(e.target.value) || 0)}
                  className="input input-text mt-1 w-full rounded-lg px-2 py-1.5 tabular-nums"
                />
              </div>
            </div>
            <p className="numeric-data mt-3 text-right text-sm font-bold">
              Subtotal {currencyLabel} {line.subtotal.toLocaleString()}
            </p>
          </div>
        </td>
      </tr>
    </>
  );
}
