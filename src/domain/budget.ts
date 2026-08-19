import type { Garment } from "./types.js";

export function totalPriceJpy(garments: readonly Pick<Garment, "priceJpy">[]): number {
  return garments.reduce((total, garment) => total + garment.priceJpy, 0);
}

export function isWithinBudget(totalJpy: number, budgetJpy: number): boolean {
  return totalJpy <= budgetJpy;
}

export function budgetDifferenceJpy(totalJpy: number, budgetJpy: number): number {
  return budgetJpy - totalJpy;
}
