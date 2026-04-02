/** Cart line shape used by standalone POS panels (CartPanel / CartItemRow). */
export type CartLine = {
  id: string;
  name: string;
  sku?: string;
  qty: number;
  unitPrice: number;
};
