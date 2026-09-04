import { flattenHeaderLabel } from "@/lib/accounting/category-column";

export const FIXED_COLUMN_ALIASES = {
  no: ["No.", "No", "番号"],
  fileName: [
    "ノートページ番号",
    "ノートページ",
    "ページ番号",
    "ファイル名",
    "レシート",
    "画像",
    "リンク",
    "Drive",
    "添付",
  ],
  store: ["店舗"],
  date: ["購入日", "日付"],
  vendor: ["取引先", "販売先", "店名"],
  taxIncluded: ["税込"],
  taxExcluded: ["税抜"],
  total: ["合計"],
} as const;

export type SummaryColumns = {
  headers: string[];
  no: number | null;
  fileName: number;
  store: number;
  date: number;
  vendor: number;
  taxIncluded: number;
  taxExcluded: number;
  total: number | null;
  categories: Map<string, number>;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function isTaxRateLabel(value: string): boolean {
  const trimmed = normalize(value).replace("%", "").replace("％", "");
  return (
    /^0(\.0+)?$/.test(trimmed) ||
    /^0\.0?8$/.test(trimmed) ||
    /^0\.1(0)?$/.test(trimmed) ||
    /^(8|10)$/.test(trimmed)
  );
}

function isCategoryLabel(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isTaxRateLabel(trimmed) && !/^\d+(\.\d+)?$/.test(trimmed);
}

function countCategoryLabels(row: string[]): number {
  return row.filter((cell) => isCategoryLabel(cell ?? "")).length;
}

function findByAliases(
  headers: string[],
  aliases: readonly string[],
): number | null {
  const normalized = headers.map(normalize);

  for (const alias of aliases) {
    const exact = normalized.indexOf(normalize(alias));
    if (exact >= 0) {
      return exact;
    }
  }

  for (const alias of aliases) {
    const needle = normalize(alias);
    if (needle.length < 2) {
      continue;
    }
    const partial = normalized.findIndex(
      (header) => header === needle || (needle.length >= 3 && header.includes(needle)),
    );
    if (partial >= 0) {
      return partial;
    }
  }

  return null;
}

function resolveFileNameColumn(
  headers: string[],
  storeIndex: number,
): number {
  return (
    findByAliases(headers, FIXED_COLUMN_ALIASES.fileName) ??
    (storeIndex > 0 ? storeIndex - 1 : 1)
  );
}

export function resolveSummaryColumns(headerRow: string[]): SummaryColumns {
  const headers = headerRow.map((cell) => (cell ?? "").trim());
  const seen = new Map<string, number[]>();

  headers.forEach((header, index) => {
    if (!header || isTaxRateLabel(header)) {
      return;
    }
    const key = normalize(header);
    const list = seen.get(key) ?? [];
    list.push(index);
    seen.set(key, list);
  });

  const requiredNames = new Set(
    ["店舗", "購入日", "日付", "取引先", "販売先", "店名", "税込", "税抜"].map(normalize),
  );
  const requiredDuplicates = [...seen.entries()]
    .filter(([name, indexes]) => indexes.length > 1 && requiredNames.has(name))
    .map(([key, indexes]) => `「${headers[indexes[0]] ?? key}」が${indexes.length}列`);
  if (requiredDuplicates.length > 0) {
    throw new Error(
      `経費集計に同じ列名が複数あります。\n${requiredDuplicates.map((item) => `・${item}`).join("\n")}\nスプレッドシートで片方の列名を変えるか、不要な列を削除してください。`,
    );
  }

  const required = [
    ["store", "store"],
    ["date", "date"],
    ["vendor", "vendor"],
    ["taxIncluded", "taxIncluded"],
    ["taxExcluded", "taxExcluded"],
  ] as const;

  const resolved = {} as Pick<
    SummaryColumns,
    "fileName" | "store" | "date" | "vendor" | "taxIncluded" | "taxExcluded"
  >;
  const preview = headers.filter(Boolean).slice(0, 12).join(" / ") || "空";

  for (const [aliasKey, field] of required) {
    const index = findByAliases(headers, FIXED_COLUMN_ALIASES[aliasKey]);
    if (index === null) {
      throw new Error(
        `経費集計に「${FIXED_COLUMN_ALIASES[aliasKey][0]}」列が見つかりません。1行目: ${preview}`,
      );
    }
    resolved[field] = index;
  }

  resolved.fileName = resolveFileNameColumn(headers, resolved.store);

  const skip = new Set<number>([
    resolved.fileName,
    resolved.store,
    resolved.date,
    resolved.vendor,
    resolved.taxIncluded,
    resolved.taxExcluded,
    findByAliases(headers, FIXED_COLUMN_ALIASES.no) ?? -1,
    findByAliases(headers, FIXED_COLUMN_ALIASES.total) ?? -1,
  ]);
  const skipNames = new Set(
    ["合計", "税込", "税抜", "no.", "no", "番号", "ノートページ番号", "店舗", "購入日", "取引先"].map(
      normalize,
    ),
  );

  const categories = new Map<string, number>();
  headers.forEach((header, index) => {
    const label = flattenHeaderLabel(header);
    if (
      !label ||
      skip.has(index) ||
      skipNames.has(normalize(header)) ||
      isTaxRateLabel(header)
    ) {
      return;
    }
    if (categories.has(label)) {
      return;
    }
    categories.set(label, index);
  });

  return {
    headers,
    ...resolved,
    no: findByAliases(headers, FIXED_COLUMN_ALIASES.no),
    total: findByAliases(headers, FIXED_COLUMN_ALIASES.total),
    categories,
  };
}

export function findHeaderRowIndex(rows: string[][]): number {
  const candidates: number[] = [];

  rows.forEach((row, index) => {
    const normalized = row.map((cell) => normalize(cell ?? ""));
    const hasStore = normalized.includes("店舗");
    const hasDate = normalized.includes("購入日") || normalized.includes("日付");
    const hasVendor = ["取引先", "販売先", "店名"].some((name) =>
      normalized.includes(normalize(name)),
    );
    if (hasStore && hasDate && hasVendor) {
      candidates.push(index);
    }
  });

  if (candidates.length === 0) {
    return 0;
  }

  return candidates.sort(
    (left, right) => countCategoryLabels(rows[right]) - countCategoryLabels(rows[left]),
  )[0];
}

export function resolveHeaderLabels(rows: string[][], headerRowIndex: number): string[] {
  const base = rows[headerRowIndex] ?? [];
  const neighbors = [rows[headerRowIndex - 1], rows[headerRowIndex + 1]].filter(
    (row): row is string[] => Boolean(row),
  );
  const width = Math.max(base.length, ...neighbors.map((row) => row.length), 0);
  const labels: string[] = [];

  for (let index = 0; index < width; index += 1) {
    const parts = [base[index], ...neighbors.map((row) => row[index])]
      .map((cell) => flattenHeaderLabel(cell ?? ""))
      .filter(Boolean);
    const primary = parts.find((cell) => isCategoryLabel(cell)) ?? "";
    const continuation = parts.find(
      (cell) => cell !== primary && /^[（(]/.test(cell),
    );
    labels.push(`${primary}${continuation ?? ""}`);
  }

  return labels;
}

export function findFirstDataRowIndex(
  rows: string[][],
  headerRowIndex: number,
): number {
  let start = headerRowIndex + 1;
  while (start < rows.length) {
    const row = rows[start] ?? [];
    const filled = row.filter((cell) => (cell ?? "").trim());
    if (filled.length === 0) {
      start += 1;
      continue;
    }
    const rateOnly = filled.every((cell) => isTaxRateLabel(cell));
    if (rateOnly) {
      start += 1;
      continue;
    }
    break;
  }
  return start;
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
