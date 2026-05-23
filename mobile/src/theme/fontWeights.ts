/** Numeric font-weight tokens — shared across product-card typography. */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semiBold: 600,
  bold: 700,
} as const;

export type FontWeightToken = keyof typeof fontWeights;
