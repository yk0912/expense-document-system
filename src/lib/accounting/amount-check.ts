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

export function distributeExclusiveInclusive(
  amounts: number[],
  ratePercent: number,
): number[] {
  if (amounts.length === 0) {
    return [];
  }
  if (ratePercent <= 0) {
    return [...amounts];
  }
  const sum = amounts.reduce((total, amount) => total + amount, 0);
  const groupTax = floorConsumptionTax(sum, ratePercent);
  const taxes = amounts.map((amount) => floorConsumptionTax(amount, ratePercent));
  let remainder = groupTax - taxes.reduce((total, tax) => total + tax, 0);
  const ranked = amounts
    .map((amount, index) => ({
      index,
      frac: (amount * ratePercent) / 100 - taxes[index],
    }))
    .sort((left, right) =>
      remainder >= 0 ? right.frac - left.frac : left.frac - right.frac,
    );
  for (const { index } of ranked) {
    if (remainder === 0) {
      break;
    }
    const step = remainder > 0 ? 1 : -1;
    taxes[index] += step;
    remainder -= step;
  }
  return amounts.map((amount, index) => amount + taxes[index]);
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

export function excludedBaseForRate(
  items: Array<{
    amount: number | null;
    taxRate: number | null;
    taxKind?: TaxKind | null;
  }>,
  rate: 8 | 10,
): number | null {
  const amounts = items
    .filter(
      (item) =>
        itemTaxPercent(item.taxRate) === rate && item.taxKind === "excluded",
    )
    .map((item) => item.amount);
  if (amounts.length === 0) {
    return null;
  }
  return sumAmounts(amounts);
}

export function hasMixedItemTaxKinds(
  items: Array<{ taxRate: number | null; taxKind?: TaxKind | null }>,
  rate: 8 | 10,
): boolean {
  let included = false;
  let excluded = false;
  for (const item of items) {
    if (itemTaxPercent(item.taxRate) !== rate) {
      continue;
    }
    if (item.taxKind === "included") {
      included = true;
    }
    if (item.taxKind === "excluded") {
      excluded = true;
    }
  }
  return included && excluded;
}

function extraTaxForGroup(
  kind: TaxKind | null,
  printedTax: number | null,
  mixed: boolean,
  excludedBase: number | null,
  rate: 8 | 10,
): number {
  if (kind === "included") {
    return 0;
  }
  if (mixed && excludedBase !== null) {
    return consumptionTaxFromBase(excludedBase, rate, "excluded");
  }
  return printedTax ?? 0;
}

function addPrintedRateGroup(
  taxable: number | null,
  printedTax: number | null,
  kind: TaxKind | null,
  mixed: boolean,
  excludedBase: number | null,
  rate: 8 | 10,
): { add: number; used: boolean } {
  if (taxable === null && printedTax === null) {
    return { add: 0, used: false };
  }
  if (kind === "included") {
    return { add: taxable ?? 0, used: taxable !== null };
  }
  let add = 0;
  let used = false;
  if (taxable !== null) {
    add += taxable;
    used = true;
  }
  const extra = extraTaxForGroup(kind, printedTax, mixed, excludedBase, rate);
  add += extra;
  if (taxable !== null || printedTax !== null || mixed) {
    used = true;
  }
  return { add, used };
}

export function printedInclusiveFromGroups(input: {
  subtotal: number | null;
  taxable8: number | null;
  taxable10: number | null;
  tax8: number | null;
  tax10: number | null;
  taxKind8: TaxKind | null;
  taxKind10: TaxKind | null;
  mixed8?: boolean;
  mixed10?: boolean;
  excludedBase8?: number | null;
  excludedBase10?: number | null;
}): number | null {
  const mixed8 = Boolean(input.mixed8);
  const mixed10 = Boolean(input.mixed10);
  const hasTaxable = input.taxable8 !== null || input.taxable10 !== null;
  if (hasTaxable) {
    let sum = 0;
    let used = false;
    if (input.taxable8 !== null || input.tax8 !== null) {
      const group = addPrintedRateGroup(
        input.taxable8,
        input.tax8,
        input.taxKind8,
        mixed8,
        input.excludedBase8 ?? null,
        8,
      );
      sum += group.add;
      used = used || group.used;
    }
    if (input.taxable10 !== null || input.tax10 !== null) {
      const group = addPrintedRateGroup(
        input.taxable10,
        input.tax10,
        input.taxKind10,
        mixed10,
        input.excludedBase10 ?? null,
        10,
      );
      sum += group.add;
      used = used || group.used;
    }
    if (input.subtotal !== null) {
      const covered = (input.taxable8 ?? 0) + (input.taxable10 ?? 0);
      const leftover = input.subtotal - covered;
      if (leftover > 0) {
        sum += leftover;
        used = true;
      }
    }
    return used ? sum : null;
  }

  if (input.subtotal === null) {
    return null;
  }
  return (
    input.subtotal +
    extraTaxForGroup(
      input.taxKind8,
      input.tax8,
      mixed8,
      input.excludedBase8 ?? null,
      8,
    ) +
    extraTaxForGroup(
      input.taxKind10,
      input.tax10,
      mixed10,
      input.excludedBase10 ?? null,
      10,
    )
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
  let otherInclusive = 0;
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
    if (percent === 8 || percent === 10) {
      groups[percent][kind].push(item.amount);
    } else {
      otherInclusive += inclusiveFromBase(item.amount, percent ?? 0, kind);
      if (percent !== 0 && percent !== 1) {
        complete = false;
      }
    }
  }

  const taxForRate = (rate: 8 | 10) => {
    const included = groups[rate].included;
    const excluded = groups[rate].excluded;
    if (included.length === 0 && excluded.length === 0) {
      return { taxable: null, tax: null, inclusive: 0 };
    }
    const includedSum = included.reduce((sum, amount) => sum + amount, 0);
    const excludedSum = excluded.reduce((sum, amount) => sum + amount, 0);
    const excludedTax = consumptionTaxFromBase(excludedSum, rate, "excluded");
    return {
      taxable: includedSum + excludedSum,
      tax:
        consumptionTaxFromBase(includedSum, rate, "included") + excludedTax,
      // レシートと同じく税率グループで切り捨て。商品ごとに切り捨てて足すと数円ずれる
      inclusive: includedSum + excludedSum + excludedTax,
    };
  };

  const group8 = taxForRate(8);
  const group10 = taxForRate(10);

  return {
    tax8: group8.tax,
    tax10: group10.tax,
    taxable8: group8.taxable,
    taxable10: group10.taxable,
    inclusiveTotal: hasAmount
      ? otherInclusive + group8.inclusive + group10.inclusive
      : null,
    complete,
  };
}
