import type { CategoryMasterItem, ItemTaxRate, TaxKind } from "@/types/receipt";

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

export function floorIncludedTax(inclusive: number, ratePercent: number): number {
  if (ratePercent <= 0) {
    return 0;
  }
  return Math.floor((inclusive * ratePercent) / (100 + ratePercent));
}

export function consumptionTaxFromBase(
  base: number,
  ratePercent: number,
  kind: TaxKind,
): number {
  if (ratePercent <= 0) {
    return 0;
  }
  return kind === "included"
    ? floorIncludedTax(base, ratePercent)
    : floorConsumptionTax(base, ratePercent);
}

export function inclusiveFromBase(
  base: number,
  ratePercent: number,
  kind: TaxKind,
): number {
  if (kind === "included") {
    return base;
  }
  return base + floorConsumptionTax(base, ratePercent);
}

export function floorInclusiveAmount(exclusive: number, ratePercent: number): number {
  return exclusive + floorConsumptionTax(exclusive, ratePercent);
}

export function resolveItemTaxKind(
  item: { taxRate: number | null; taxKind?: TaxKind | null },
  defaults: { taxKind8?: TaxKind | null; taxKind10?: TaxKind | null } = {},
): TaxKind {
  if (item.taxKind === "included" || item.taxKind === "excluded") {
    return item.taxKind;
  }
  const percent = itemTaxPercent(item.taxRate);
  if (percent === 8 && defaults.taxKind8) {
    return defaults.taxKind8;
  }
  if (percent === 10 && defaults.taxKind10) {
    return defaults.taxKind10;
  }
  return "excluded";
}

export function inferTaxKind(
  taxable: number | null,
  printedTax: number | null,
  ratePercent: number,
): TaxKind | null {
  if (taxable === null || printedTax === null || taxable <= 0) {
    return null;
  }
  const included = floorIncludedTax(taxable, ratePercent);
  const excluded = floorConsumptionTax(taxable, ratePercent);
  if (included === printedTax && excluded !== printedTax) {
    return "included";
  }
  if (excluded === printedTax && included !== printedTax) {
    return "excluded";
  }
  return null;
}

export function printedInclusiveFromGroups(input: {
  subtotal: number | null;
  taxable8: number | null;
  taxable10: number | null;
  tax8: number | null;
  tax10: number | null;
  taxKind8: TaxKind | null;
  taxKind10: TaxKind | null;
}): number | null {
  const hasTaxable = input.taxable8 !== null || input.taxable10 !== null;
  if (hasTaxable) {
    let sum = 0;
    let used = false;
    if (input.taxable8 !== null || input.tax8 !== null) {
      if (input.taxKind8 === "included") {
        if (input.taxable8 !== null) {
          sum += input.taxable8;
          used = true;
        }
      } else {
        if (input.taxable8 !== null) {
          sum += input.taxable8;
          used = true;
        }
        if (input.tax8 !== null) {
          sum += input.tax8;
          used = true;
        }
      }
    }
    if (input.taxable10 !== null || input.tax10 !== null) {
      if (input.taxKind10 === "included") {
        if (input.taxable10 !== null) {
          sum += input.taxable10;
          used = true;
        }
      } else {
        if (input.taxable10 !== null) {
          sum += input.taxable10;
          used = true;
        }
        if (input.tax10 !== null) {
          sum += input.tax10;
          used = true;
        }
      }
    }
    return used ? sum : null;
  }

  if (input.subtotal === null) {
    return null;
  }
  return (
    input.subtotal +
    (input.taxKind8 === "included" ? 0 : (input.tax8 ?? 0)) +
    (input.taxKind10 === "included" ? 0 : (input.tax10 ?? 0))
  );
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
    return sum + inclusiveFromBase(amount, percent, "excluded");
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
  items: Array<{
    amount: number | null;
    taxRate: number | null;
    taxKind?: TaxKind | null;
  }>,
  defaults: { taxKind8?: TaxKind | null; taxKind10?: TaxKind | null } = {},
): {
  tax8: number | null;
  tax10: number | null;
  taxable8: number | null;
  taxable10: number | null;
  inclusiveTotal: number | null;
  complete: boolean;
} {
  const groups = {
    8: { included: [] as number[], excluded: [] as number[] },
    10: { included: [] as number[], excluded: [] as number[] },
  };
  let inclusiveTotal = 0;
  let complete = items.length > 0;
  let hasAmount = false;

  for (const item of items) {
    if (item.amount === null) {
      complete = false;
      continue;
    }
    hasAmount = true;
    const percent = itemTaxPercent(item.taxRate);
    const kind = resolveItemTaxKind(item, defaults);
    inclusiveTotal += inclusiveFromBase(item.amount, percent ?? 0, kind);
    if (percent === 8 || percent === 10) {
      groups[percent][kind].push(item.amount);
    } else if (percent !== 0 && percent !== 1) {
      complete = false;
    }
  }

  const taxForRate = (rate: 8 | 10) => {
    const included = groups[rate].included;
    const excluded = groups[rate].excluded;
    if (included.length === 0 && excluded.length === 0) {
      return { taxable: null, tax: null };
    }
    const includedSum = included.reduce((sum, amount) => sum + amount, 0);
    const excludedSum = excluded.reduce((sum, amount) => sum + amount, 0);
    return {
      taxable: includedSum + excludedSum,
      tax:
        consumptionTaxFromBase(includedSum, rate, "included") +
        consumptionTaxFromBase(excludedSum, rate, "excluded"),
    };
  };

  const group8 = taxForRate(8);
  const group10 = taxForRate(10);

  return {
    tax8: group8.tax,
    tax10: group10.tax,
    taxable8: group8.taxable,
    taxable10: group10.taxable,
    inclusiveTotal: hasAmount ? inclusiveTotal : null,
    complete,
  };
}
