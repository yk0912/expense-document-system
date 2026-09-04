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

function asTaxRateFraction(taxRate: number): number {
  return taxRate > 1 ? taxRate / 100 : taxRate;
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
    const rate = asTaxRateFraction(item.taxRate ?? 0);
    return sum + Math.round(amount * (1 + rate));
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
