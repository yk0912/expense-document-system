import type { CategoryMasterItem, ItemTaxRate } from "@/types/receipt";

export function sumAmounts(amounts: Array<number | null>): number | null {
  if (amounts.some((amount) => amount === null)) {
    return null;
  }
  return amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}

function taxInclusiveCandidates(exclusive: number, rate: number): number[] {
  const raw = exclusive * (1 + rate);
  return [Math.round(raw), Math.floor(raw), Math.ceil(raw)];
}

export function floorConsumptionTax(exclusive: number, ratePercent: number): number {
  return Math.floor(exclusive * (ratePercent / 100));
}

export function floorInclusiveAmount(exclusive: number, ratePercent: number): number {
  return exclusive + floorConsumptionTax(exclusive, ratePercent);
}

export function explainedByConsumptionTax(
  receiptTotal: number,
  lineTotal: number,
): 8 | 10 | null {
  if (receiptTotal === lineTotal) {
    return null;
  }

  for (const rate of [0.08, 0.1] as const) {
    if (taxInclusiveCandidates(lineTotal, rate).includes(receiptTotal)) {
      return rate === 0.08 ? 8 : 10;
    }
  }

  return null;
}

export function explainedByItemTaxRates(
  receiptTotal: number,
  items: Array<{ amount: number | null; taxRate: number | null }>,
): boolean {
  if (items.length === 0 || items.some((item) => item.amount === null || item.taxRate === null)) {
    return false;
  }

  const inclusive = items.reduce((sum, item) => {
    const amount = item.amount ?? 0;
    const percent = itemTaxPercent(item.taxRate) ?? 0;
    return sum + floorInclusiveAmount(amount, percent);
  }, 0);

  return inclusive === receiptTotal;
}

export function looksLikeConsumptionTaxGap(
  receiptTotal: number,
  lineTotal: number,
): boolean {
  if (lineTotal <= 0 || receiptTotal <= lineTotal) {
    return false;
  }
  return (receiptTotal - lineTotal) / lineTotal <= 0.11;
}

export function parseMasterTaxRate(raw: string | null | undefined): ItemTaxRate | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, "");
  if (/非課税|対象外|免税/.test(normalized) || /^0(%|％)?$/.test(normalized)) {
    return 0;
  }
  if (/10|0\.1/.test(normalized)) {
    return 10;
  }
  if (/8|0\.08/.test(normalized)) {
    return 8;
  }
  if (/1(%|％)|0\.01/.test(normalized)) {
    return 1;
  }
  return null;
}

export function defaultTaxRateForCategory(
  category: string | null,
  categories: CategoryMasterItem[] = [],
): ItemTaxRate {
  if (!category) {
    return 0;
  }
  const masterRate = parseMasterTaxRate(
    categories.find((item) => item.name === category)?.taxRate,
  );
  if (masterRate !== null) {
    return masterRate;
  }
  const compact = category.replace(/\s+/g, "");
  if (/食材|材料|食品/.test(compact)) {
    return 8;
  }
  if (/備品/.test(compact)) {
    return 10;
  }
  return 0;
}

export function normalizeItemTaxRate(taxRate: number | null): ItemTaxRate {
  if (taxRate === null) {
    return 0;
  }
  if (taxRate === 0) {
    return 0;
  }
  if (taxRate > 0 && taxRate <= 1) {
    if (Math.abs(taxRate - 0.01) < 0.005 || taxRate === 1) {
      return 1;
    }
    if (Math.abs(taxRate - 0.08) < 0.015) {
      return 8;
    }
    if (Math.abs(taxRate - 0.1) < 0.03) {
      return 10;
    }
  }
  if (Math.abs(taxRate - 1) < 0.5) {
    return 1;
  }
  if (Math.abs(taxRate - 8) < 1) {
    return 8;
  }
  if (Math.abs(taxRate - 10) < 1) {
    return 10;
  }
  return 0;
}

export function itemTaxPercent(taxRate: number | null): ItemTaxRate | null {
  if (taxRate === null) {
    return null;
  }
  return normalizeItemTaxRate(taxRate);
}

export function taxBreakdownFromItems(
  items: Array<{ amount: number | null; taxRate: number | null }>,
): {
  tax8: number | null;
  tax10: number | null;
  taxable8: number | null;
  taxable10: number | null;
  complete: boolean;
} {
  const amounts8: number[] = [];
  const amounts10: number[] = [];
  let complete = items.length > 0;

  for (const item of items) {
    if (item.amount === null) {
      complete = false;
      continue;
    }
    const percent = itemTaxPercent(item.taxRate);
    if (percent === 8) {
      amounts8.push(item.amount);
    } else if (percent === 10) {
      amounts10.push(item.amount);
    } else if (percent !== 0 && percent !== 1) {
      complete = false;
    }
  }

  const taxable8 = amounts8.length > 0 ? amounts8.reduce((sum, amount) => sum + amount, 0) : null;
  const taxable10 = amounts10.length > 0 ? amounts10.reduce((sum, amount) => sum + amount, 0) : null;

  return {
    tax8: taxable8 === null ? null : floorConsumptionTax(taxable8, 8),
    tax10: taxable10 === null ? null : floorConsumptionTax(taxable10, 10),
    taxable8,
    taxable10,
    complete,
  };
}
