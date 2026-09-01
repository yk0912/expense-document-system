import { google } from "googleapis";

import { matchCategoryName } from "@/lib/accounting/category-column";
import {
  findHeaderRowIndex,
  resolveHeaderLabels,
  resolveSummaryColumns,
} from "@/lib/accounting/sheet-column-resolver";
import { createMemoryTtlCache } from "@/lib/cache/memory-ttl";
import {
  createGoogleOAuthClient,
  describeGoogleCredentialIssue,
} from "@/lib/google/auth";
import type { CategoryMasterItem } from "@/types/receipt";

const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;
const categoryCache = createMemoryTtlCache<CategoryFetchResult>(CATEGORY_CACHE_TTL_MS);

const NAME_ALIASES = [
  "経費区分",
  "経費区分名",
  "区分名",
  "区分",
  "科目",
  "勘定科目",
  "費目",
  "分類",
];
const EXAMPLE_ALIASES = ["具体例", "例", "商品例"];
const TAX_ALIASES = ["消費税率", "税率"];
const DESCRIPTION_ALIASES = ["説明", "確定申告上の分類", "備考", "内容"];
const SKIP_SUMMARY_HEADERS = new Set([
  "no.",
  "no",
  "ノートページ番号",
  "店舗",
  "購入日",
  "取引先",
  "税込",
  "税抜",
  "合計",
]);

type CategoryFetchResult = {
  categories: CategoryMasterItem[];
  warning: string | null;
};

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function findColumn(headers: string[], aliases: readonly string[]): number | null {
  const normalized = headers.map(normalizeHeader);

  for (const alias of aliases) {
    const exact = normalized.indexOf(normalizeHeader(alias));
    if (exact >= 0) {
      return exact;
    }
  }

  for (const alias of aliases) {
    const needle = normalizeHeader(alias);
    const partial = normalized.findIndex(
      (header) => header.includes(needle) && header.length <= needle.length + 8,
    );
    if (partial >= 0) {
      return partial;
    }
  }

  return null;
}

function parseNamedSheet(rows: string[][]): CategoryMasterItem[] {
  if (rows.length === 0) {
    return [];
  }

  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) =>
      NAME_ALIASES.some((alias) => normalizeHeader(cell ?? "").includes(alias)),
    ),
  );
  const start = headerRowIndex >= 0 ? headerRowIndex : 0;
  const headers = rows[start].map((cell) => cell ?? "");
  const nameIndex = findColumn(headers, NAME_ALIASES) ?? 0;
  const examplesIndex = findColumn(headers, EXAMPLE_ALIASES);
  const taxRateIndex = findColumn(headers, TAX_ALIASES);
  const descriptionIndex = findColumn(headers, DESCRIPTION_ALIASES);
  const dataRows = headerRowIndex >= 0 ? rows.slice(start + 1) : rows;

  return uniqueCategories(
    dataRows.map((row) => ({
      name: row[nameIndex]?.trim() ?? "",
      examples:
        examplesIndex === null ? null : row[examplesIndex]?.trim() || null,
      taxRate: taxRateIndex === null ? null : row[taxRateIndex]?.trim() || null,
      description:
        descriptionIndex === null
          ? null
          : row[descriptionIndex]?.trim() || null,
    })),
  );
}

function parseSummaryHeaders(headerRow: string[]): CategoryMasterItem[] {
  return uniqueCategories(
    headerRow
      .map((cell) => cell.trim())
      .filter((name) => name && !SKIP_SUMMARY_HEADERS.has(normalizeHeader(name).toLowerCase()))
      .filter((name) => !/^no\.?$/i.test(name))
      .map((name) => ({
        name,
        examples: null,
        taxRate: null,
        description: null,
      })),
  );
}

function alignMasterToSheetColumns(
  master: CategoryMasterItem[],
  columnNames: string[],
): CategoryMasterItem[] {
  if (columnNames.length === 0) {
    return master;
  }

  return columnNames.map((name) => {
    const exact = master.find((item) => item.name === name);
    if (exact) {
      return exact;
    }
    const related = master.find(
      (item) => matchCategoryName(item.name, [name]) === name,
    );
    if (related) {
      return {
        name,
        examples: related.examples,
        taxRate: related.taxRate,
        description: related.description,
      };
    }
    return {
      name,
      examples: null,
      taxRate: null,
      description: null,
    };
  });
}

function uniqueCategories(items: CategoryMasterItem[]): CategoryMasterItem[] {
  const seen = new Set<string>();
  const categories: CategoryMasterItem[] = [];
  for (const item of items) {
    if (!item.name || seen.has(item.name)) {
      continue;
    }
    seen.add(item.name);
    categories.push(item);
  }
  return categories;
}

function findSheetTitle(
  titles: string[],
  preferred: string,
  needles: readonly string[],
): string | null {
  const exact = titles.find((title) => title === preferred);
  if (exact) {
    return exact;
  }

  const normalizedNeedles = needles.map(normalizeHeader);
  return (
    titles.find((title) => {
      const normalized = normalizeHeader(title);
      return normalizedNeedles.some((needle) => normalized.includes(needle));
    }) ?? null
  );
}

function toSheetsErrorMessage(error: unknown): string {
  const gaxios = error as {
    message?: string;
    response?: {
      data?: { error?: string | { message?: string; status?: string } };
    };
  };
  const data = gaxios.response?.data?.error;
  const raw =
    typeof data === "string"
      ? data
      : data?.message ?? gaxios.message ?? "不明なエラー";

  if (raw.includes("invalid_grant")) {
    return "Googleのrefresh tokenが無効です。OAuth Playgroundで「Exchange authorization code for tokens」のあと、右側のrefresh_token（1// で始まる値）を .env.local に入れて、開発サーバーを再起動してください。";
  }
  if (raw.includes("Requested entity was not found")) {
    return "スプレッドシートが見つかりません。GOOGLE_SPREADSHEET_ID がURLの /d/ と /edit の間の文字列になっているか確認してください。";
  }
  if (raw.includes("Unable to parse range")) {
    return "指定したシート名が見つかりません。タブ名が「経費区分の説明」「経費集計」と一致しているか確認してください。";
  }
  if (
    raw.toLowerCase().includes("office file") ||
    raw.toLowerCase().includes("not supported for this document")
  ) {
    return "指定したファイルは Excel のままです。Google スプレッドシートに変換したうえで、アドレスバーが docs.google.com/spreadsheets/d/ で始まる画面の /d/ と /edit の間を GOOGLE_SPREADSHEET_ID に入れてください。Drive の file/d/ のIDでは使えません。";
  }

  return raw;
}

function categoryCacheKey(
  spreadsheetId: string,
  categorySheetName: string,
  summarySheetName: string,
): string {
  return `${spreadsheetId}\t${categorySheetName}\t${summarySheetName}\theader-v2`;
}

export async function fetchCategoryMaster(): Promise<CategoryFetchResult> {
  const credentialIssue = describeGoogleCredentialIssue();
  if (credentialIssue) {
    return { categories: [], warning: credentialIssue };
  }

  const auth = createGoogleOAuthClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  const categorySheetName =
    process.env.GOOGLE_CATEGORY_SHEET_NAME ?? "経費区分の説明";
  const summarySheetName = process.env.GOOGLE_SHEET_NAME ?? "経費集計";

  if (!auth || !spreadsheetId) {
    return {
      categories: [],
      warning:
        "Google認証またはスプレッドシートIDが未設定のため、経費区分を取得できませんでした。",
    };
  }

  const cacheKey = categoryCacheKey(
    spreadsheetId,
    categorySheetName,
    summarySheetName,
  );
  const cached = categoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const store = (result: CategoryFetchResult) => {
      if (result.categories.length > 0) {
        categoryCache.set(cacheKey, result);
      }
      return result;
    };

    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    const titles =
      meta.data.sheets
        ?.map((sheet) => sheet.properties?.title)
        .filter((title): title is string => Boolean(title)) ?? [];

    const resolvedCategory =
      findSheetTitle(titles, categorySheetName, ["経費区分"]) ??
      categorySheetName;
    const resolvedSummary =
      findSheetTitle(titles, summarySheetName, ["経費集計"]) ?? summarySheetName;

    const [categoryResponse, summaryResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${resolvedCategory}'!A1:Z200`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${resolvedSummary}'!1:8`,
      }),
    ]);
    let categories = parseNamedSheet(
      (categoryResponse.data.values ?? []) as string[][],
    );

    const summaryRows = ((summaryResponse.data.values ?? []) as string[][]).map(
      (row) => row.map((cell) => cell ?? ""),
    );
    let sheetColumns: string[] = [];
    try {
      if (summaryRows.length > 0) {
        const headerRowIndex = findHeaderRowIndex(summaryRows);
        sheetColumns = [
          ...resolveSummaryColumns(
            resolveHeaderLabels(summaryRows, headerRowIndex),
          ).categories.keys(),
        ];
      }
    } catch {
      sheetColumns = [];
    }

    if (categories.length === 0) {
      categories = parseSummaryHeaders(summaryRows[0] ?? []);
      if (sheetColumns.length > 0) {
        categories = alignMasterToSheetColumns(categories, sheetColumns);
      }
      if (categories.length > 0) {
        return store({
          categories,
          warning: `「${resolvedCategory}」から区分名を特定できなかったため、「${resolvedSummary}」の列見出しを選択肢に使っています。`,
        });
      }

      const preview = ((categoryResponse.data.values?.[0] ?? []) as string[])
        .filter(Boolean)
        .join(" / ");
      return {
        categories: [],
        warning: `経費区分を取得できませんでした。タブ: ${titles.join(" / ") || "なし"} / 1行目: ${preview || "空"}`,
      };
    }

    if (sheetColumns.length > 0) {
      categories = alignMasterToSheetColumns(categories, sheetColumns);
    }

    return store({ categories, warning: null });
  } catch (error) {
    return {
      categories: [],
      warning: `経費区分マスタの取得に失敗しました。${toSheetsErrorMessage(error)}`,
    };
  }
}

