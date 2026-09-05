import {
  inclusiveFromBase,
  itemTaxPercent,
  resolveItemTaxKind,
} from "@/lib/accounting/amount-check";
import type { TaxKind } from "@/types/receipt";

export function sumAmountsByCategory(
  items: Array<{ category: string | null; amount: number | null }>,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.category || item.amount === null) {
      continue;
    }
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  }

  return totals;
}

export function sheetInclusiveAmount(
  amount: number,
  taxRate: number | null,
  taxKind: TaxKind | null,
  priceBasis: "tax_included" | "tax_excluded",
): number {
  if (priceBasis === "tax_included") {
    return amount;
  }
  const percent = itemTaxPercent(taxRate) ?? 0;
  const kind = resolveItemTaxKind({ taxRate, taxKind });
  return inclusiveFromBase(amount, percent, kind);
}

export function sumSheetCategoryAmounts(
  items: Array<{
    category: string | null;
    amount: number | null;
    taxRate?: number | null;
    taxKind?: TaxKind | null;
  }>,
  priceBasis: "tax_included" | "tax_excluded",
): { amounts: Map<string, number>; taxIncluded: boolean } {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.category || item.amount === null) {
      continue;
    }
    const value = sheetInclusiveAmount(
      item.amount,
      item.taxRate ?? null,
      item.taxKind ?? null,
      priceBasis,
    );
    totals.set(item.category, (totals.get(item.category) ?? 0) + value);
  }

  return { amounts: totals, taxIncluded: true };
}
