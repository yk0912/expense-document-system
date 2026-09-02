import { google, type sheets_v4 } from "googleapis";

import { toGoogleErrorMessage } from "@/lib/google/errors";
import { ISSUE_SHEET_NAME } from "@/lib/settings/types";
import { ISSUE_STATUS, type IssueSheetRow } from "@/types/issue";

type SheetsAuth = Parameters<typeof google.sheets>[0]["auth"];

const ISSUE_HEADERS = [
  "報告日時",
  "店舗",
  "購入日",
  "取引先",
  "不良項目",
  "詳細",
  "画像",
  "ステータス",
] as const;

function sheetsClient(auth: SheetsAuth) {
  return google.sheets({ version: "v4", auth });
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function flattenHeader(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function hyperlinkFormula(url: string, label: string): string {
  const safeUrl = url.replaceAll('"', "");
  const safeLabel = label.replaceAll('"', "");
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

function cell(row: string[] | undefined, index: number | undefined): string {
  if (index === undefined || index < 0) {
    return "";
  }
  return row?.[index]?.trim() ?? "";
}

async function findOrCreateIssueSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
): Promise<{ sheetId: number; title: string }> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const existing = meta.data.sheets?.find(
    (sheet) => sheet.properties?.title === title,
  );
  if (existing?.properties?.sheetId != null && existing.properties.title) {
    return {
      sheetId: existing.properties.sheetId,
      title: existing.properties.title,
    };
  }

  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        },
      ],
    },
  });
  const sheetId =
    created.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  if (sheetId == null) {
    throw new Error(`「${title}」シートの作成に失敗しました。`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quotedSheet(title)}!A1:H1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [ISSUE_HEADERS.map((header) => header)],
    },
  });

  return { sheetId, title };
}

function columnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = flattenHeader(header);
    if (key && !map.has(key)) {
      map.set(key, index);
    }
  });
  return map;
}

export async function listIssueRows(
  auth: SheetsAuth,
  spreadsheetId: string,
  sheetName = ISSUE_SHEET_NAME,
): Promise<IssueSheetRow[]> {
  const sheets = sheetsClient(auth);
  try {
    const { title } = await findOrCreateIssueSheet(sheets, spreadsheetId, sheetName);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quotedSheet(title)}!A1:H5000`,
    });
    const values = (response.data.values ?? []) as string[][];
    if (values.length === 0) {
      return [];
    }
    const headers = values[0] ?? [];
    const columns = columnMap(headers);
    const reportedAt = columns.get(flattenHeader("報告日時"));
    const store = columns.get(flattenHeader("店舗"));
    const date = columns.get(flattenHeader("購入日"));
    const vendor = columns.get(flattenHeader("取引先"));
    const fields = columns.get(flattenHeader("不良項目"));
    const note = columns.get(flattenHeader("詳細"));
    const image = columns.get(flattenHeader("画像"));
    const status = columns.get(flattenHeader("ステータス"));

    return values.slice(1).flatMap((row, index) => {
      const vendorName = cell(row, vendor);
      const failedFields = cell(row, fields);
      const reported = cell(row, reportedAt);
      if (!vendorName && !failedFields && !reported) {
        return [];
      }
      const imageCell = cell(row, image);
      const urlMatch = imageCell.match(/HYPERLINK\("([^"]+)"/);
      return [
        {
          rowNumber: index + 2,
          reportedAt: reported,
          assignedStore: cell(row, store),
          transactionDate: cell(row, date),
          vendorName,
          failedFields,
          note: cell(row, note),
          fileName: imageCell.replace(/=HYPERLINK\("[^"]+","([^"]+)"\)/, "$1") || imageCell,
          fileUrl: urlMatch?.[1] ?? "",
          status: cell(row, status) || ISSUE_STATUS.open,
        } satisfies IssueSheetRow,
      ];
    });
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "読み取り不良シートの取得に失敗しました。"));
  }
}

export async function appendIssueRows(
  auth: SheetsAuth,
  spreadsheetId: string,
  rows: Array<{
    reportedAt: string;
    assignedStore: string;
    transactionDate: string;
    vendorName: string;
    failedFields: string;
    note: string;
    fileName: string;
    fileUrl: string;
    status: string;
  }>,
  sheetName = ISSUE_SHEET_NAME,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const sheets = sheetsClient(auth);
  try {
    const { title } = await findOrCreateIssueSheet(sheets, spreadsheetId, sheetName);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quotedSheet(title)}!A:H`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: rows.map((row) => [
          row.reportedAt,
          row.assignedStore,
          row.transactionDate,
          row.vendorName,
          row.failedFields,
          row.note,
          row.fileUrl ? hyperlinkFormula(row.fileUrl, row.fileName || "画像") : row.fileName,
          row.status,
        ]),
      },
    });
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "読み取り不良の記録に失敗しました。"));
  }
}
