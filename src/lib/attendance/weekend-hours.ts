import { columnLetter } from "@/lib/accounting/sheet-column-resolver";
import { japaneseHolidays } from "@/lib/attendance/holidays";
import {
  ATTENDANCE_DAY1_COLUMN_INDEX,
  parseSheetDateHeader,
} from "@/lib/attendance/sheet-header";

/** 各人の土日祝勤務時間。3行×1列の結合セルの左上。 */
export const WEEKEND_HOLIDAY_HOURS_COLUMN = "AH";

export function offDayColumnIndexes(labels: string[], year: number): number[] {
  const holidays = japaneseHolidays(year);
  const indexes: number[] = [];
  labels.forEach((label, offset) => {
    const parsed = parseSheetDateHeader(label);
    if (!parsed?.month) {
      return;
    }
    const mark = label.match(/[（(]([月火水木金土日])[)）]/)?.[1];
    const weekday = new Date(year, parsed.month - 1, parsed.day).getDay();
    const weekend = mark === "土" || mark === "日" || weekday === 0 || weekday === 6;
    const holiday = holidays.has(`${parsed.month}-${parsed.day}`);
    if (weekend || holiday) {
      indexes.push(ATTENDANCE_DAY1_COLUMN_INDEX + offset);
    }
  });
  return indexes;
}

export function weekendHolidayWorkHoursFormula(
  row: number,
  columnIndexes: number[],
): string | null {
  if (columnIndexes.length === 0) {
    return null;
  }
  const cells = columnIndexes.map((index) => `${columnLetter(index)}${row}`);
  return `=SUM(${cells.join(",")})`;
}
