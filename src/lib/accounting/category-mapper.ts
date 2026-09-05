import {
  distributeExclusiveInclusive,
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

function sheetItemKind(
  item: { taxRate?: number | null; taxKind?: TaxKind | null },
  priceBasis: "tax_included" | "tax_excluded",
): TaxKind {
  if (item.taxKind === "included" || item.taxKind === "excluded") {
    return item.taxKind;
  }
  return priceBasis === "tax_included"
    ? "included"
    : resolveItemTaxKind({
        taxRate: item.taxRate ?? null,
        taxKind: item.taxKind,
      });
}

export function sheetInclusiveAmount(
  amount: number,
  taxRate: number | null,
  taxKind: TaxKind | null,
  priceBasis: "tax_included" | "tax_excluded",
): number {
  const percent = itemTaxPercent(taxRate) ?? 0;
  const kind = sheetItemKind({ taxRate, taxKind }, priceBasis);
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
  const inclusive = new Array<number | null>(items.length).fill(null);
  const excludedGroups: Record<8 | 10, number[]> = { 8: [], 10: [] };

  items.forEach((item, index) => {
    if (!item.category || item.amount === null) {
      return;
    }
    const percent = itemTaxPercent(item.taxRate ?? null);
    const kind = sheetItemKind(item, priceBasis);
    if ((percent === 8 || percent === 10) && kind === "excluded") {
      excludedGroups[percent].push(index);
      return;
    }
    inclusive[index] = inclusiveFromBase(item.amount, percent ?? 0, kind);
  });

  for (const rate of [8, 10] as const) {
    const indexes = excludedGroups[rate];
    if (indexes.length === 0) {
      continue;
    }
    const allocated = distributeExclusiveInclusive(
      indexes.map((index) => items[index]?.amount ?? 0),
      rate,
    );
    indexes.forEach((itemIndex, offset) => {
      inclusive[itemIndex] = allocated[offset] ?? 0;
    });
  }

  items.forEach((item, index) => {
    const value = inclusive[index];
    if (!item.category || value === null) {
      return;
    }
    totals.set(item.category, (totals.get(item.category) ?? 0) + value);
  });

  return { amounts: totals, taxIncluded: true };
}
