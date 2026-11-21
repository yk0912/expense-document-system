import { weekendAndHolidayDays } from "@/lib/attendance/holidays";
import { dayColumnLetter } from "@/lib/attendance/sheet-header";

/** 見出し行の結合セル。3行×1列の左上。 */
export const WEEKEND_HOLIDAY_HOURS_CELL = "AH9";

export function weekendHolidayWorkHoursFormula(
  rows: number[],
  year: number,
  month: number,
): string | null {
  const days = weekendAndHolidayDays(year, month);
  if (rows.length === 0 || days.length === 0) {
    return null;
  }
  const cells = rows.flatMap((row) => days.map((day) => `${dayColumnLetter(day)}${row}`));
  return `=SUM(${cells.join(",")})`;
}
