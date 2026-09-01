export function parseTransactionDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const slash = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }

  const japanese = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})/);
  if (japanese) {
    return `${japanese[1]}-${japanese[2].padStart(2, "0")}-${japanese[3].padStart(2, "0")}`;
  }

  return null;
}

export function dateInputValue(value: string | null | undefined): string {
  return parseTransactionDate(value) ?? "";
}
