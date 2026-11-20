import { findPersonRow, type NameCell } from "@/lib/attendance/names";
import {
  dayColumnIndex,
  daysInMonth,
  headerMismatchMessage,
  type DateHeader,
} from "@/lib/attendance/sheet-header";
import type { AttendanceRegisterResult, AttendanceWriteSheet } from "@/types/attendance";

export type CellUpdate = {
  rowNumber: number;
  columnIndex: number;
  value: string | number;
};

export type ExistingCells = Map<string, number | null>;

export function existingCellKey(rowNumber: number, columnIndex: number): string {
  return `${rowNumber}:${columnIndex}`;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function desiredValues(
  day: AttendanceWriteSheet["days"][number],
): Array<number | null> {
  if (day.cleared) {
    return [null, null, null];
  }
  return [
    day.actualHours == null ? null : roundHours(day.actualHours),
    day.earlyHours == null || day.earlyHours <= 0 ? null : roundHours(day.earlyHours),
    day.transportYen == null ? null : Math.round(day.transportYen),
  ];
}

function valuesDiffer(existing: number | null, next: number | null): boolean {
  if (existing == null && next == null) {
    return false;
  }
  if (existing == null || next == null) {
    return true;
  }
  return Math.abs(existing - next) > 0.001;
}

function sameYearMonth(header: DateHeader | null, year: number, month: number): boolean {
  return (
    header != null &&
    header.day === 1 &&
    header.month === month &&
    (header.year == null || header.year === year)
  );
}

function invalidNumber(value: number | null, label: string): string | null {
  if (value == null) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 24) {
    return `${label}は0から24の間で入力してください。`;
  }
  return null;
}

export function planAttendanceWrites(input: {
  sheets: AttendanceWriteSheet[];
  names: NameCell[];
  header: DateHeader | null;
  existing: ExistingCells;
  readAllTargets?: boolean;
}): {
  results: AttendanceRegisterResult[];
  updates: CellUpdate[];
  overwriteDayCount: number;
  needsConfirm: boolean;
} {
  const updates: CellUpdate[] = [];
  let overwriteDayCount = 0;
  let needsConfirm = false;

  const results = input.sheets.map((sheet) => {
    const fail = (error: string, rowNumber: number | null = null): AttendanceRegisterResult => ({
      sheetIndex: sheet.sheetIndex,
      employeeName: sheet.employeeName,
      ok: false,
      rowNumber,
      writtenDays: 0,
      clearedDays: 0,
      overwriteDayCount: 0,
      resetsWriteArea: false,
      error,
      headerWarning: null,
    });

    if (!sheet.employeeName.trim()) {
      return fail("氏名を入力してください。");
    }
    if (
      sheet.year == null ||
      sheet.month == null ||
      sheet.month < 1 ||
      sheet.month > 12 ||
      sheet.year < 2000 ||
      sheet.year > 2100
    ) {
      return fail("年月を入力してください。");
    }

    const headerCheck = headerMismatchMessage(input.header, sheet.year, sheet.month);
    if (headerCheck.error) {
      return fail(headerCheck.error);
    }

    const found = findPersonRow(input.names, sheet.employeeName);
    if (!found.ok) {
      return fail(found.error);
    }

    const monthDays = daysInMonth(sheet.year, sheet.month);
    const seen = new Set<number>();
    const byDay = new Map<number, AttendanceWriteSheet["days"][number]>();

    for (const day of sheet.days) {
      if (!Number.isInteger(day.day) || day.day < 1 || day.day > monthDays) {
        return fail(`${sheet.month}月に${day.day}日はありません。`, found.rowNumber);
      }
      if (seen.has(day.day)) {
        return fail(`${day.day}日が重複しています。`, found.rowNumber);
      }
      seen.add(day.day);
      const hoursError =
        invalidNumber(day.actualHours, `${day.day}日の実働時間`) ??
        invalidNumber(day.earlyHours, `${day.day}日の早朝深夜時間`);
      if (hoursError) {
        return fail(hoursError, found.rowNumber);
      }
      if (day.transportYen != null && (!Number.isFinite(day.transportYen) || day.transportYen < 0)) {
        return fail(`${day.day}日の交通費を確認してください。`, found.rowNumber);
      }
      byDay.set(day.day, day);
    }

    if (byDay.size === 0) {
      return fail("転記する日がありません。", found.rowNumber);
    }

    const resetsWriteArea = sameYearMonth(input.header, sheet.year, sheet.month);
    const dayNumbers = resetsWriteArea
      ? Array.from({ length: monthDays }, (_, index) => index + 1)
      : [...byDay.keys()];
    const localUpdates: CellUpdate[] = [];
    let writtenDays = 0;
    let clearedDays = 0;
    let sheetOverwrites = 0;

    for (const dayNumber of dayNumbers) {
      const day = byDay.get(dayNumber);
      const columnIndex = dayColumnIndex(dayNumber);
      const nextValues = day ? desiredValues(day) : [null, null, null];
      const existingValues = [0, 1, 2].map((offset) => {
        const key = existingCellKey(found.rowNumber + offset, columnIndex);
        return input.existing.has(key) ? (input.existing.get(key) ?? null) : null;
      });
      const changed = nextValues.some((value, index) =>
        valuesDiffer(existingValues[index] ?? null, value),
      );
      if (changed && existingValues.some((value) => value != null)) {
        sheetOverwrites += 1;
      }
      const replaceRow = resetsWriteArea || input.readAllTargets === true;
      nextValues.forEach((value, offset) => {
        const current = existingValues[offset] ?? null;
        if (!replaceRow && !valuesDiffer(current, value)) {
          return;
        }
        localUpdates.push({
          rowNumber: found.rowNumber + offset,
          columnIndex,
          value: value == null ? "" : value,
        });
      });
      if (nextValues.some((value) => value != null)) {
        writtenDays += 1;
      } else if (day?.cleared || existingValues.some((value) => value != null)) {
        clearedDays += 1;
      }
    }

    updates.push(...localUpdates);
    overwriteDayCount += sheetOverwrites;
    if (headerCheck.warning) {
      needsConfirm = true;
    }
    return {
      sheetIndex: sheet.sheetIndex,
      employeeName: sheet.employeeName,
      ok: true,
      rowNumber: found.rowNumber,
      writtenDays,
      clearedDays,
      overwriteDayCount: sheetOverwrites,
      resetsWriteArea,
      error: null,
      headerWarning: headerCheck.warning,
    } satisfies AttendanceRegisterResult;
  });

  if (overwriteDayCount > 0) {
    needsConfirm = true;
  }

  return {
    results,
    updates,
    overwriteDayCount,
    needsConfirm: needsConfirm && results.some((result) => result.ok),
  };
}
