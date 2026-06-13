/** Format a quantity: whole numbers stay clean, fractions show 2 decimals. */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
