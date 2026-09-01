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
    if (taxInclusiveCandidates(receiptTotal, rate).includes(lineTotal)) {
      return rate === 0.08 ? 8 : 10;
    }
  }

  return null;
}
