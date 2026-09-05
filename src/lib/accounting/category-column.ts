function normalizeCategoryName(value: string): string {
  return flattenHeaderLabel(value).replaceAll(":", "：");
}

function categoryMatchKey(value: string): string {
  return normalizeCategoryName(value)
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[・･．.]/g, "")
    .toLowerCase();
}

export function flattenHeaderLabel(value: string): string {
  return value.replace(/[\n\r\u2028\u2029]+/g, "").replace(/\s+/g, "").trim();
}

export function matchCategoryName(
  name: string,
  available: Iterable<string>,
): string | null {
  const columns = [...available];
  const normalized = normalizeCategoryName(name);
  if (!normalized) {
    return null;
  }

  const exact = columns.find(
    (column) => normalizeCategoryName(column) === normalized,
  );
  if (exact) {
    return exact;
  }

  const key = categoryMatchKey(name);
  if (!key) {
    return null;
  }

  const stripped = columns.filter((column) => categoryMatchKey(column) === key);
  if (stripped.length === 1) {
    return stripped[0];
  }
  if (stripped.length > 1) {
    return [...stripped].sort((left, right) => left.length - right.length)[0];
  }

  if (key.length < 2) {
    return null;
  }

  const partial = columns.filter((column) => {
    const columnKey = categoryMatchKey(column);
    return (
      columnKey.length >= 2 &&
      (columnKey.includes(key) || key.includes(columnKey))
    );
  });
  if (partial.length === 1) {
    return partial[0];
  }

  return null;
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
