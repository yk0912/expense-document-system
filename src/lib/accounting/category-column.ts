function normalizeCategoryName(value: string): string {
  return flattenHeaderLabel(value).replaceAll(":", "：");
}

export function flattenHeaderLabel(value: string): string {
  return value.replace(/[\n\r\u2028\u2029]+/g, "").replace(/\s+/g, "").trim();
}

export function matchCategoryName(
  name: string,
  available: Iterable<string>,
): string | null {
  const normalized = normalizeCategoryName(name);
  if (!normalized) {
    return null;
  }

  return (
    [...available].find(
      (column) => normalizeCategoryName(column) === normalized,
    ) ?? null
  );
}

export function remapCategoryAmounts(
  amounts: Map<string, number>,
  available: Iterable<string>,
): { amounts: Map<string, number>; missing: string[] } {
  const remapped = new Map<string, number>();
  const missing: string[] = [];

  for (const [name, amount] of amounts) {
    const resolved = matchCategoryName(name, available);
    if (!resolved) {
      missing.push(name);
      continue;
    }
    remapped.set(resolved, (remapped.get(resolved) ?? 0) + amount);
  }

  return { amounts: remapped, missing };
}
