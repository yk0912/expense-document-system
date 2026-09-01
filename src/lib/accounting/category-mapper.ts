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
