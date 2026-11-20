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
    const localUpdates: CellUpdate[] = [];
    let writtenDays = 0;
    let clearedDays = 0;
    let sheetOverwrites = 0;

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

      const columnIndex = dayColumnIndex(day.day);
      const nextValues = desiredValues(day);
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
      nextValues.forEach((value, offset) => {
        const current = existingValues[offset] ?? null;
        if (!input.readAllTargets && !valuesDiffer(current, value)) {
          return;
        }
        localUpdates.push({
          rowNumber: found.rowNumber + offset,
          columnIndex,
          value: value == null ? "" : value,
        });
      });
      if (day.cleared) {
        clearedDays += 1;
      } else {
        writtenDays += 1;
      }
    }

    if (writtenDays + clearedDays === 0) {
      return fail("転記する日がありません。", found.rowNumber);
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
