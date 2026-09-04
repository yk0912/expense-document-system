import { google, type sheets_v4 } from "googleapis";

import { findDuplicateRows } from "@/lib/accounting/duplicate-detector";
import { remapCategoryAmounts } from "@/lib/accounting/category-column";
import {
  columnLetter,
  findFirstDataRowIndex,
  findHeaderRowIndex,
  resolveHeaderLabels,
  resolveSummaryColumns,
  type SummaryColumns,
} from "@/lib/accounting/sheet-column-resolver";
import { createMemoryTtlCache } from "@/lib/cache/memory-ttl";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import { FORMAT_SHEET_NAME } from "@/lib/settings/types";
import type { Store } from "@/types/receipt";

type SheetsAuth = Parameters<typeof google.sheets>[0]["auth"];

export type ReceiptSheetWrite = {
  assignedStore: Store;
  transactionDate: string;
  vendorName: string;
  priceBasis: "tax_included" | "tax_excluded";
  categoryAmounts: Map<string, number>;
  totalAmount: number;
  fileName: string;
  fileUrl: string;
};

export type WrittenSheetRow = {
  rowNumber: number;
  duplicates: ReturnType<typeof findDuplicateRows>;
};

export type SheetLayout = {
  title: string;
  sheetId: number;
  headerRowIndex: number;
  columns: SummaryColumns;
};

export type AppendReceiptRowsResult = {
  layout: SheetLayout;
  written: WrittenSheetRow[];
};

const LAYOUT_CACHE_TTL_MS = 5 * 60 * 1000;
const layoutCache = createMemoryTtlCache<SheetLayout>(LAYOUT_CACHE_TTL_MS);

function sheetsClient(auth: SheetsAuth) {
  return google.sheets({ version: "v4", auth });
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

type SheetRef = {
  title: string;
  sheetId: number;
};

async function listSheets(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<SheetRef[]> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  return (
    meta.data.sheets
      ?.map((sheet) => ({
        title: sheet.properties?.title ?? "",
        sheetId: sheet.properties?.sheetId,
      }))
      .filter((sheet): sheet is SheetRef =>
        Boolean(sheet.title) && typeof sheet.sheetId === "number",
      ) ?? []
  );
}

function layoutCacheKey(spreadsheetId: string, preferredTitle: string): string {
  return `${spreadsheetId}\t${preferredTitle}\theader-v2`;
}

export function invalidateSheetLayoutCache(
  spreadsheetId: string,
  preferredTitle: string,
) {
  layoutCache.delete(layoutCacheKey(spreadsheetId, preferredTitle));
}

function findSheetByTitle(sheets: SheetRef[], title: string): SheetRef | undefined {
  const needle = title.trim();
  return sheets.find((sheet) => sheet.title.trim() === needle);
}

async function renameSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  title: string,
): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, title },
            fields: "title",
          },
        },
      ],
    },
  });
}

async function ensureUserReceiptSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  targetTitle: string,
  formatTitle = FORMAT_SHEET_NAME,
): Promise<SheetRef> {
  const existing = findSheetByTitle(await listSheets(sheets, spreadsheetId), targetTitle);
  if (existing) {
    return existing;
  }

  const format = findSheetByTitle(await listSheets(sheets, spreadsheetId), formatTitle);
  if (!format) {
    throw new Error(
      `「${formatTitle}」シートが見つかりません。書き込み先ブックに用意してください。`,
    );
  }

  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: format.sheetId,
          },
        },
      ],
    },
  });
  const props = created.data.replies?.[0]?.duplicateSheet?.properties;
  if (props?.sheetId == null) {
    throw new Error(`「${targetTitle}」シートの作成に失敗しました。`);
  }

  try {
    await renameSheet(sheets, spreadsheetId, props.sheetId, targetTitle);
    layoutCache.delete(layoutCacheKey(spreadsheetId, targetTitle));
    return { sheetId: props.sheetId, title: targetTitle };
  } catch (error) {
    const raced = findSheetByTitle(await listSheets(sheets, spreadsheetId), targetTitle);
    if (raced) {
      if (raced.sheetId !== props.sheetId) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ deleteSheet: { sheetId: props.sheetId } }],
          },
        }).catch(() => undefined);
      }
      return raced;
    }
    throw error;
  }
}

function hyperlinkFormula(url: string, label: string): string {
  const safeUrl = url.replaceAll('"', "");
  const safeLabel = label.replaceAll('"', "");
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

function isFooterRow(row: string[]): boolean {
  const text = row.join("");
  return /合計|総計|小計|備考/.test(text);
}

function cell(row: string[] | undefined, index: number): string {
  return row?.[index]?.trim() ?? "";
}

function isBlankCell(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    trimmed === "0" ||
    trimmed === "-" ||
    trimmed === "ー" ||
    trimmed === "－"
  );
}

function isRealVendor(value: string): boolean {
  if (isBlankCell(value)) {
    return false;
  }
  if (/^\d+(\.\d+)?$/.test(value.trim())) {
    return false;
  }
  return value.trim().length >= 2;
}

function isRealDataRow(row: string[], columns: SummaryColumns): boolean {
  return isRealVendor(cell(row, columns.vendor));
}

function toStringCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function columnVector(range: sheets_v4.Schema$ValueRange | undefined): string[] {
  return (range?.values ?? []).map((row) => toStringCell(row?.[0]));
}

async function loadSheetLayout(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  preferredTitle: string,
): Promise<SheetLayout> {
  const cacheKey = layoutCacheKey(spreadsheetId, preferredTitle);
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const matched = findSheetByTitle(
    await listSheets(sheets, spreadsheetId),
    preferredTitle,
  );

  if (!matched) {
    throw new Error(`「${preferredTitle}」シートが見つかりません。`);
  }

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quotedSheet(matched.title)}!1:8`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const headerRows = ((headerResponse.data.values ?? []) as unknown[][]).map(
    (row) => row.map(toStringCell),
  );
  if (headerRows.length === 0) {
    throw new Error(`「${matched.title}」シートが空です。`);
  }

  const headerRowIndex = findHeaderRowIndex(headerRows);
  const layout: SheetLayout = {
    title: matched.title,
    sheetId: matched.sheetId,
    headerRowIndex,
    columns: resolveSummaryColumns(resolveHeaderLabels(headerRows, headerRowIndex)),
  };
  layoutCache.set(cacheKey, layout);
  return layout;
}

async function loadScanRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  layout: SheetLayout,
): Promise<string[][]> {
  const { title, columns } = layout;
  const ranges = [
    `${quotedSheet(title)}!A:A`,
    `${quotedSheet(title)}!${columnLetter(columns.date)}:${columnLetter(columns.date)}`,
    `${quotedSheet(title)}!${columnLetter(columns.vendor)}:${columnLetter(columns.vendor)}`,
  ];
  if (columns.total !== null) {
    ranges.push(
      `${quotedSheet(title)}!${columnLetter(columns.total)}:${columnLetter(columns.total)}`,
    );
  }

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const valueRanges = response.data.valueRanges ?? [];
  const colA = columnVector(valueRanges[0]);
  const dates = columnVector(valueRanges[1]);
  const vendors = columnVector(valueRanges[2]);
  const totals = columns.total !== null ? columnVector(valueRanges[3]) : [];
  const width = Math.max(columns.date, columns.vendor, columns.total ?? 0, 0);
  const height = Math.max(colA.length, dates.length, vendors.length, totals.length);

  const rows: string[][] = [];
  for (let index = 0; index < height; index += 1) {
    const row = Array.from({ length: width + 1 }, () => "");
    row[0] = colA[index] ?? "";
    row[columns.date] = dates[index] ?? "";
    row[columns.vendor] = vendors[index] ?? "";
    if (columns.total !== null) {
      row[columns.total] = totals[index] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function findDataStartIndex(rows: string[][], headerRowIndex: number): number {
  const windowEnd = Math.min(rows.length, headerRowIndex + 8);
  const start = findFirstDataRowIndex(rows.slice(0, windowEnd), headerRowIndex);
  if (start >= windowEnd) {
    return Math.min(headerRowIndex + 1, rows.length);
  }
  return start;
}

function findTargetRow(
  rows: string[][],
  columns: SummaryColumns,
  headerRowIndex: number,
): { rowNumber: number; insert: boolean } {
  const dataStart = findDataStartIndex(rows, headerRowIndex);
  let lastDataIndex = -1;

  for (let index = dataStart; index < rows.length; index += 1) {
    if (isRealDataRow(rows[index], columns)) {
      lastDataIndex = index;
    }
  }

  if (lastDataIndex < 0) {
    return { rowNumber: dataStart + 1, insert: false };
  }

  const nextRowNumber = lastDataIndex + 2;
  const nextRow = rows[nextRowNumber - 1];
  if (nextRow && isFooterRow(nextRow) && !isRealDataRow(nextRow, columns)) {
    return { rowNumber: nextRowNumber, insert: true };
  }

  return { rowNumber: nextRowNumber, insert: false };
}

function buildRowUpdates(
  title: string,
  columns: SummaryColumns,
  rowNumber: number,
  receipt: ReceiptSheetWrite,
): sheets_v4.Schema$ValueRange[] {
  const left = [
    {
      index: columns.fileName,
      value: receipt.fileUrl
        ? hyperlinkFormula(receipt.fileUrl, receipt.fileName)
        : receipt.fileName,
    },
    { index: columns.store, value: receipt.assignedStore },
    { index: columns.date, value: receipt.transactionDate },
    { index: columns.vendor, value: receipt.vendorName },
    {
      index: columns.taxIncluded,
      value: receipt.priceBasis === "tax_included" ? "〇" : "",
    },
    {
      index: columns.taxExcluded,
      value: receipt.priceBasis === "tax_excluded" ? "〇" : "",
    },
  ].sort((leftCell, rightCell) => leftCell.index - rightCell.index);

  const data: sheets_v4.Schema$ValueRange[] = [];
  const first = left[0];
  const last = left[left.length - 1];
  const contiguous = left.every((cell, offset) => cell.index === first.index + offset);

  if (contiguous) {
    data.push({
      range: `${quotedSheet(title)}!${columnLetter(first.index)}${rowNumber}:${columnLetter(last.index)}${rowNumber}`,
      values: [left.map((cell) => cell.value)],
    });
  } else {
    for (const cell of left) {
      data.push({
        range: `${quotedSheet(title)}!${columnLetter(cell.index)}${rowNumber}`,
        values: [[cell.value]],
      });
    }
  }

  for (const [name, amount] of receipt.categoryAmounts) {
    const column = columns.categories.get(name);
    if (column === undefined || column === columns.total) {
      continue;
    }
    data.push({
      range: `${quotedSheet(title)}!${columnLetter(column)}${rowNumber}`,
      values: [[amount]],
    });
  }

  return data;
}

export async function appendReceiptRows(
  auth: SheetsAuth,
  spreadsheetId: string,
  preferredTitle: string,
  receipts: ReceiptSheetWrite[],
): Promise<AppendReceiptRowsResult> {
  if (receipts.length === 0) {
    throw new Error("転記するレシートがありません。");
  }

  const sheets = sheetsClient(auth);

  try {
    const targetSheet = await ensureUserReceiptSheet(
      sheets,
      spreadsheetId,
      preferredTitle,
    );
    let layout = await loadSheetLayout(sheets, spreadsheetId, targetSheet.title);
    const remapWrites = (current = layout) =>
      receipts.map((receipt) => {
        const remapped = remapCategoryAmounts(
          receipt.categoryAmounts,
          current.columns.categories.keys(),
        );
        return { receipt: { ...receipt, categoryAmounts: remapped.amounts }, missing: remapped.missing };
      });

    let preparedWrites = remapWrites();
    if (preparedWrites.some((item) => item.missing.length > 0)) {
      invalidateSheetLayoutCache(spreadsheetId, targetSheet.title);
      layout = await loadSheetLayout(sheets, spreadsheetId, targetSheet.title);
      preparedWrites = remapWrites(layout);
    }

    const missingCategories = [
      ...new Set(preparedWrites.flatMap((item) => item.missing)),
    ];
    if (missingCategories.length > 0) {
      throw new Error(
        `経費集計に次の区分列がありません: ${missingCategories.join("、")}`,
      );
    }

    const writes = preparedWrites.map((item) => item.receipt);

    const rows = await loadScanRows(sheets, spreadsheetId, layout);
    const target = findTargetRow(rows, layout.columns, layout.headerRowIndex);
    const startRow = target.rowNumber;

    if (target.insert) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: layout.sheetId,
                  dimension: "ROWS",
                  startIndex: startRow - 1,
                  endIndex: startRow - 1 + receipts.length,
                },
                inheritFromBefore: true,
              },
            },
          ],
        },
      });
    }

    const data = writes.flatMap((receipt, offset) =>
      buildRowUpdates(
        layout.title,
        layout.columns,
        startRow + offset,
        receipt,
      ),
    );

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });

    const formulaColumns = [layout.columns.no, layout.columns.total].filter(
      (index): index is number => index !== null,
    );
    const formulaSourceRow =
      startRow - 1 > layout.headerRowIndex + 1 ? startRow - 1 : null;
    if (formulaSourceRow && formulaColumns.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: receipts.flatMap((_, offset) =>
            formulaColumns.map((columnIndex) => ({
              copyPaste: {
                source: {
                  sheetId: layout.sheetId,
                  startRowIndex: formulaSourceRow - 1,
                  endRowIndex: formulaSourceRow,
                  startColumnIndex: columnIndex,
                  endColumnIndex: columnIndex + 1,
                },
                destination: {
                  sheetId: layout.sheetId,
                  startRowIndex: startRow - 1 + offset,
                  endRowIndex: startRow + offset,
                  startColumnIndex: columnIndex,
                  endColumnIndex: columnIndex + 1,
                },
                pasteType: "PASTE_FORMULA" as const,
                pasteOrientation: "NORMAL" as const,
              },
            })),
          ),
        },
      });
    }

    return {
      layout,
      written: receipts.map((receipt, offset) => ({
        rowNumber: startRow + offset,
        duplicates: findDuplicateRows(rows, layout.columns, {
          transactionDate: receipt.transactionDate,
          vendorName: receipt.vendorName,
          total: receipt.totalAmount,
        }),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.startsWith("経費集計") ||
      message.includes("フォーマット") ||
      message.includes("シート")
    ) {
      throw error instanceof Error ? error : new Error(message);
    }
    throw new Error(
      toGoogleErrorMessage(error, "スプレッドシートへの転記に失敗しました。"),
    );
  }
}

export async function updateReceiptFileLinks(
  auth: SheetsAuth,
  spreadsheetId: string,
  layout: SheetLayout,
  links: Array<{ rowNumber: number; fileName: string; fileUrl: string }>,
): Promise<void> {
  if (links.length === 0) {
    return;
  }

  const sheets = sheetsClient(auth);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: links.map((link) => ({
        range: `${quotedSheet(layout.title)}!${columnLetter(layout.columns.fileName)}${link.rowNumber}`,
        values: [[hyperlinkFormula(link.fileUrl, link.fileName)]],
      })),
    },
  });
}

export async function clearReceiptRows(
  auth: SheetsAuth,
  spreadsheetId: string,
  layout: SheetLayout,
  rowNumbers: number[],
): Promise<void> {
  if (rowNumbers.length === 0) {
    return;
  }

  const sheets = sheetsClient(auth);
  const lastColumn = Math.max(
    layout.columns.fileName,
    layout.columns.store,
    layout.columns.date,
    layout.columns.vendor,
    layout.columns.taxIncluded,
    layout.columns.taxExcluded,
    layout.columns.total ?? 0,
    ...layout.columns.categories.values(),
  );

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: rowNumbers.map(
        (rowNumber) =>
          `${quotedSheet(layout.title)}!A${rowNumber}:${columnLetter(lastColumn)}${rowNumber}`,
      ),
    },
  });
}
