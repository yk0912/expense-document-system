import { Readable } from "node:stream";

import { google, type sheets_v4 } from "googleapis";

import { columnLetter } from "@/lib/accounting/sheet-column-resolver";
import { readXlsxSheetNames } from "@/lib/attendance/xlsx-sheet-names";
import {
  existingCellKey,
  planAttendanceWrites,
  type CellUpdate,
} from "@/lib/attendance/write-plan";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import {
  ATTENDANCE_DAY1_COLUMN_INDEX,
  findDateHeader,
  type DateHeader,
} from "@/lib/attendance/sheet-header";
import { workHourRows, type NameCell } from "@/lib/attendance/names";
import {
  WEEKEND_HOLIDAY_HOURS_CELL,
  weekendHolidayWorkHoursFormula,
} from "@/lib/attendance/weekend-hours";
import { spreadsheetUrlFromId } from "@/lib/settings/parse";
import type {
  AttendanceDirectory,
  AttendanceRegisterResponse,
  AttendanceWriteSheet,
} from "@/types/attendance";

type SheetsAuth = Parameters<typeof google.sheets>[0]["auth"];

function sheetsClient(auth: SheetsAuth) {
  return google.sheets({ version: "v4", auth });
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function cellNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,¥￥円\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-excel.template.macroenabled.12",
]);

type DriveFileRef = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
};

const conversionCache = new Map<string, Promise<{ spreadsheetId: string; converted: boolean }>>();

export async function listSpreadsheetSheetTitles(
  auth: SheetsAuth,
  spreadsheetId: string,
): Promise<{ titles: string[]; excel: boolean }> {
  const sheets = sheetsClient(auth);
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(title)",
    });
    const titles =
      meta.data.sheets
        ?.map((sheet) => sheet.properties?.title?.trim() ?? "")
        .filter((title) => title.length > 0) ?? [];
    return { titles, excel: false };
  } catch (error) {
    if (!isOfficeSpreadsheetError(error)) {
      throw new Error(sheetListErrorMessage(error));
    }
    try {
      const titles = readXlsxSheetNames(await downloadSpreadsheetFile(auth, spreadsheetId));
      if (titles.length === 0) {
        throw new Error("シートが見つかりません。");
      }
      return { titles, excel: true };
    } catch (readError) {
      if (readError instanceof Error && readError.message === "シートが見つかりません。") {
        throw readError;
      }
      throw new Error(sheetListErrorMessage(error));
    }
  }
}

export function ensureGoogleSpreadsheet(
  auth: SheetsAuth,
  fileId: string,
): Promise<{ spreadsheetId: string; converted: boolean }> {
  const cached = conversionCache.get(fileId);
  if (cached) {
    return cached;
  }
  const pending = convertToGoogleSpreadsheet(auth, fileId);
  conversionCache.set(fileId, pending);
  pending.catch(() => {
    conversionCache.delete(fileId);
  });
  return pending;
}

export async function openGoogleAttendanceSpreadsheet<T>(
  auth: SheetsAuth,
  spreadsheetId: string,
  run: (spreadsheetId: string) => Promise<T>,
): Promise<{ spreadsheetId: string; converted: boolean; value: T }> {
  try {
    return { spreadsheetId, converted: false, value: await run(spreadsheetId) };
  } catch (error) {
    if (!isOfficeSpreadsheetError(error)) {
      throw error;
    }
    const converted = await ensureGoogleSpreadsheet(auth, spreadsheetId);
    if (!converted.converted || converted.spreadsheetId === spreadsheetId) {
      throw new Error(
        "このファイルは Excel のままです。設定で保存すると、Googleスプレッドシートに変換したコピーを転記先にします。",
      );
    }
    return {
      spreadsheetId: converted.spreadsheetId,
      converted: true,
      value: await run(converted.spreadsheetId),
    };
  }
}

function isExcelFile(mimeType: string, name: string): boolean {
  const mime = mimeType.toLowerCase();
  return (
    EXCEL_MIME_TYPES.has(mime) ||
    mime.includes("excel") ||
    mime.includes("spreadsheetml") ||
    /\.xls[xmb]?$/i.test(name)
  );
}

function convertedSheetName(name: string): string {
  return `${name.replace(/\.xls[xmb]?$/i, "") || "勤怠"}（Googleスプレッドシート）`;
}

async function resolveDriveFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
): Promise<DriveFileRef> {
  const meta = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,parents,shortcutDetails",
    supportsAllDrives: true,
  });
  const shortcutId = meta.data.shortcutDetails?.targetId;
  if (meta.data.mimeType === SHORTCUT_MIME && shortcutId) {
    const target = await drive.files.get({
      fileId: shortcutId,
      fields: "id,name,mimeType,parents",
      supportsAllDrives: true,
    });
    return {
      id: target.data.id ?? shortcutId,
      name: target.data.name ?? "勤怠",
      mimeType: target.data.mimeType ?? "",
      parents: target.data.parents ?? [],
    };
  }
  return {
    id: meta.data.id ?? fileId,
    name: meta.data.name ?? "勤怠",
    mimeType: meta.data.mimeType ?? "",
    parents: meta.data.parents ?? [],
  };
}

async function findConvertedCopy(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string,
): Promise<string | null> {
  const response = await drive.files.list({
    q: [
      `'${parentId}' in parents`,
      `name = '${name.replaceAll("'", "\\'")}'`,
      `mimeType = '${GOOGLE_SHEET_MIME}'`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return response.data.files?.[0]?.id ?? null;
}

async function copyAsGoogleSheet(
  drive: ReturnType<typeof google.drive>,
  file: DriveFileRef,
  name: string,
): Promise<string | null> {
  try {
    const copied = await drive.files.copy({
      fileId: file.id,
      supportsAllDrives: true,
      requestBody: {
        name,
        mimeType: GOOGLE_SHEET_MIME,
      },
      fields: "id",
    });
    const copiedId = copied.data.id;
    if (!copiedId) {
      return null;
    }
    const meta = await drive.files.get({
      fileId: copiedId,
      fields: "mimeType",
      supportsAllDrives: true,
    });
    if (meta.data.mimeType === GOOGLE_SHEET_MIME) {
      return copiedId;
    }
    await drive.files.delete({ fileId: copiedId, supportsAllDrives: true }).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

async function uploadAsGoogleSheet(
  auth: SheetsAuth,
  drive: ReturnType<typeof google.drive>,
  file: DriveFileRef,
  name: string,
): Promise<string> {
  const bytes = await downloadSpreadsheetFile(auth, file.id);
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: GOOGLE_SHEET_MIME,
      parents: file.parents.length > 0 ? file.parents : undefined,
    },
    media: {
      mimeType: file.mimeType || "application/vnd.ms-excel.sheet.macroenabled.12",
      body: Readable.from(bytes),
    },
    fields: "id,mimeType",
    supportsAllDrives: true,
  });
  if (!created.data.id || created.data.mimeType !== GOOGLE_SHEET_MIME) {
    throw new Error("Googleスプレッドシートへ変換できませんでした。");
  }
  return created.data.id;
}

async function convertToGoogleSpreadsheet(
  auth: SheetsAuth,
  fileId: string,
): Promise<{ spreadsheetId: string; converted: boolean }> {
  try {
    const drive = google.drive({ version: "v3", auth });
    const file = await resolveDriveFile(drive, fileId);
    if (file.mimeType === GOOGLE_SHEET_MIME) {
      return { spreadsheetId: file.id, converted: false };
    }
    if (!isExcelFile(file.mimeType, file.name)) {
      try {
        const sheets = sheetsClient(auth);
        await sheets.spreadsheets.get({
          spreadsheetId: file.id,
          fields: "spreadsheetId",
        });
        return { spreadsheetId: file.id, converted: false };
      } catch (error) {
        if (!isOfficeSpreadsheetError(error)) {
          throw error;
        }
      }
    }
    const name = convertedSheetName(file.name);
    const parentId = file.parents[0];
    const existingId = parentId ? await findConvertedCopy(drive, parentId, name) : null;
    if (existingId) {
      return { spreadsheetId: existingId, converted: true };
    }
    const copiedId = (await copyAsGoogleSheet(drive, file, name)) ?? (await uploadAsGoogleSheet(auth, drive, file, name));
    return { spreadsheetId: copiedId, converted: true };
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "Googleスプレッドシートへ変換できませんでした。"));
  }
}

async function downloadSpreadsheetFile(auth: SheetsAuth, fileId: string): Promise<Buffer> {
  const drive = google.drive({ version: "v3", auth });
  const media = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const raw = media.data;
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  return Buffer.from(raw as Uint8Array);
}

function isOfficeSpreadsheetError(error: unknown): boolean {
  const raw = toGoogleErrorMessage(error, "");
  return (
    raw.includes("Excel") ||
    raw.toLowerCase().includes("office file") ||
    raw.toLowerCase().includes("not supported for this document")
  );
}

function sheetListErrorMessage(error: unknown): string {
  const raw = toGoogleErrorMessage(error, "シート一覧を読み取れませんでした。");
  if (
    raw.toLowerCase().includes("office file") ||
    raw.toLowerCase().includes("not supported for this document") ||
    raw.includes("Excel")
  ) {
    return "このファイルは Excel のままです。Googleスプレッドシートで開き、「ファイル」から「Googleスプレッドシートとして保存」したURLを入力してください。";
  }
  if (
    raw.includes("Requested entity was not found") ||
    raw.includes("File not found") ||
    raw.includes("保存先フォルダ") ||
    raw.includes("not found")
  ) {
    return "スプレッドシートが見つかりません。GoogleスプレッドシートのURL、または Drive の共有リンクを入力してください。";
  }
  return raw;
}

async function findSheetTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title)",
  });
  const titles =
    meta.data.sheets
      ?.map((sheet) => sheet.properties?.title ?? "")
      .filter((title) => title.length > 0) ?? [];
  const found = titles.find((title) => title.trim() === sheetName.trim());
  if (!found) {
    throw new Error(`シート「${sheetName}」が見つかりません。`);
  }
  return found;
}

export async function loadAttendanceDirectory(
  auth: SheetsAuth,
  spreadsheetId: string,
  sheetName: string,
): Promise<AttendanceDirectory> {
  const sheets = sheetsClient(auth);
  const title = await findSheetTitle(sheets, spreadsheetId, sheetName);
  const quoted = quotedSheet(title);
  const [nameGrid, headerGrid] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quoted}!C1:C500`,
      valueRenderOption: "FORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quoted}!AJ1:AK30`,
      valueRenderOption: "FORMATTED_VALUE",
    }),
  ]);
  const names = (nameGrid.data.values ?? [])
    .map((row) => String(row?.[0] ?? "").trim())
    .filter((name) => name.length > 0);
  const header = findDateHeader(headerGrid.data.values ?? []);
  return {
    spreadsheetUrl: spreadsheetUrlFromId(spreadsheetId),
    sheetName: title,
    names: [...new Set(names)],
    headerYear: header?.year ?? null,
    headerMonth: header?.month ?? null,
    headerLabel: header?.label ?? null,
  };
}

async function loadNameCells(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  quoted: string,
): Promise<NameCell[]> {
  const grid = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoted}!C1:C500`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (grid.data.values ?? []).flatMap((row, index) => {
    const name = String(row?.[0] ?? "").trim();
    if (!name) {
      return [];
    }
    return [{ rowNumber: index + 1, name }];
  });
}

async function loadExistingCells(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  quoted: string,
  updates: Array<{ rowNumber: number; columnIndex: number }>,
): Promise<Map<string, number | null>> {
  const existing = new Map<string, number | null>();
  if (updates.length === 0) {
    return existing;
  }
  const rows = [...new Set(updates.map((update) => update.rowNumber))].sort(
    (left, right) => left - right,
  );
  const minRow = rows[0] ?? 1;
  const maxRow = rows[rows.length - 1] ?? minRow;
  const columns = updates.map((update) => update.columnIndex);
  const minColumn = Math.min(...columns, ATTENDANCE_DAY1_COLUMN_INDEX);
  const maxColumn = Math.max(...columns);
  const range = `${quoted}!${columnLetter(minColumn)}${minRow}:${columnLetter(maxColumn)}${maxRow}`;
  const grid = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = grid.data.values ?? [];
  for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
    const row = values[rowOffset] ?? [];
    for (let columnOffset = 0; columnOffset < row.length; columnOffset += 1) {
      existing.set(
        existingCellKey(minRow + rowOffset, minColumn + columnOffset),
        cellNumber(row[columnOffset]),
      );
    }
  }
  return existing;
}

async function writeCells(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  quoted: string,
  updates: CellUpdate[],
) {
  const chunkSize = 200;
  for (let index = 0; index < updates.length; index += chunkSize) {
    const chunk = updates.slice(index, index + chunkSize);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: chunk.map((update) => ({
          range: `${quoted}!${columnLetter(update.columnIndex)}${update.rowNumber}`,
          values: [[update.value]],
        })),
      },
    });
  }
}

function formulaPeriod(
  header: DateHeader | null,
  written: AttendanceWriteSheet[],
): { year: number; month: number } | null {
  const years = [
    ...new Set(
      written.flatMap((sheet) => (sheet.year == null ? [] : [sheet.year])),
    ),
  ];
  const months = [
    ...new Set(
      written.flatMap((sheet) => (sheet.month == null ? [] : [sheet.month])),
    ),
  ];
  const year = header?.year ?? (years.length === 1 ? years[0] : null);
  const month = header?.month ?? (months.length === 1 ? months[0] : null);
  if (year == null || month == null) {
    return null;
  }
  if (header?.month != null && months.length === 1 && header.month !== months[0]) {
    return null;
  }
  if (header?.year != null && years.length === 1 && header.year !== years[0]) {
    return null;
  }
  return { year, month };
}

async function writeWeekendHolidayHours(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  quoted: string,
  names: NameCell[],
  header: DateHeader | null,
  written: AttendanceWriteSheet[],
) {
  const period = formulaPeriod(header, written);
  if (!period) {
    return;
  }
  const formula = weekendHolidayWorkHoursFormula(
    workHourRows(names),
    period.year,
    period.month,
  );
  if (!formula) {
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoted}!${WEEKEND_HOLIDAY_HOURS_CELL}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[formula]] },
  });
}

export async function registerAttendanceSheets(
  auth: SheetsAuth,
  spreadsheetId: string,
  sheetName: string,
  sheetsToWrite: AttendanceWriteSheet[],
  options: { dryRun: boolean; confirmed: boolean },
): Promise<AttendanceRegisterResponse> {
  try {
    const sheets = sheetsClient(auth);
    const title = await findSheetTitle(sheets, spreadsheetId, sheetName);
    const quoted = quotedSheet(title);
    const [names, headerGrid] = await Promise.all([
      loadNameCells(sheets, spreadsheetId, quoted),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${quoted}!AJ1:AK30`,
        valueRenderOption: "FORMATTED_VALUE",
      }),
    ]);
    const header = findDateHeader(headerGrid.data.values ?? []);
    const provisional = planAttendanceWrites({
      sheets: sheetsToWrite,
      names,
      header,
      existing: new Map(),
      readAllTargets: true,
    });
    const existing = await loadExistingCells(
      sheets,
      spreadsheetId,
      quoted,
      provisional.updates,
    );
    const planned = planAttendanceWrites({
      sheets: sheetsToWrite,
      names,
      header,
      existing,
    });
    if (options.dryRun || (!options.confirmed && planned.needsConfirm)) {
      return {
        needsConfirm: planned.needsConfirm,
        overwriteDayCount: planned.overwriteDayCount,
        results: planned.results,
      };
    }
    const writtenSheets = sheetsToWrite.filter((sheet) =>
      planned.results.some((result) => result.ok && result.sheetIndex === sheet.sheetIndex),
    );
    if (writtenSheets.length > 0) {
      if (planned.updates.length > 0) {
        await writeCells(sheets, spreadsheetId, quoted, planned.updates);
      }
      await writeWeekendHolidayHours(sheets, spreadsheetId, quoted, names, header, writtenSheets);
    }
    return {
      needsConfirm: false,
      overwriteDayCount: planned.overwriteDayCount,
      results: planned.results,
    };
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "勤怠の転記に失敗しました。"));
  }
}
