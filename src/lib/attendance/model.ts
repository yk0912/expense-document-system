import { actualHoursBetween, earlyHoursBetween, formatHours, parseClock } from "@/lib/attendance/hours";
import { weekendAndHolidayDays } from "@/lib/attendance/holidays";
import { cleanEmployeeName } from "@/lib/attendance/names";
import { daysInMonth } from "@/lib/attendance/sheet-header";
import type { AttendanceDay, AttendanceWriteSheet, ReviewAttendance } from "@/types/attendance";

export type ParsedAttendanceDay = {
  day: number;
  workStart: string | null;
  workEnd: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  actualHours: number | null;
  transportYen: number | null;
  transportSameAsAbove?: boolean;
  note: string | null;
  supervisorSigned: boolean | null;
  overtimeApproved: boolean | null;
};

export type ParsedAttendanceSheet = {
  sheetIndex: number;
  employeeName: string | null;
  year: number | null;
  month: number | null;
  headerNote: string | null;
  days: ParsedAttendanceDay[];
  warnings: string[];
};

function clockOrNull(value: string | null): string | null {
  const minutes = parseClock(value);
  if (minutes == null) {
    return null;
  }
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function roundHoursValue(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function roundYen(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

export const DAILY_TRANSPORT_LIMIT_YEN = 500;

export function payableTransportYen(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 0) {
    return rounded;
  }
  return Math.min(DAILY_TRANSPORT_LIMIT_YEN, rounded);
}

export function actualHoursNeedReview(day: AttendanceDay): boolean {
  if (day.cleared || day.actualHours == null) {
    return false;
  }
  const calculated = actualHoursBetween(
    day.workStart,
    day.workEnd,
    day.breakStart,
    day.breakEnd,
  );
  return calculated != null && Math.abs(day.actualHours - calculated) > 0.01;
}

export function dayNeedsReview(day: AttendanceDay): boolean {
  if (day.cleared) {
    return false;
  }
  return (
    day.workStart == null ||
    day.workEnd == null ||
    day.actualHours == null ||
    actualHoursNeedReview(day)
  );
}

export function dayReviewNotices(day: AttendanceDay, month: number | null): string[] {
  if (!dayNeedsReview(day)) {
    return [];
  }
  const label = `${month ?? ""}月${day.day}日`;
  const notices: string[] = [];
  if (day.workStart == null) {
    notices.push(`${label}の勤務開始時間を要確認`);
  }
  if (day.workEnd == null) {
    notices.push(`${label}の勤務終了時間を要確認`);
  }
  if (day.actualHours == null || actualHoursNeedReview(day)) {
    notices.push(`${label}の実働勤務時間を要確認`);
  }
  return notices;
}

export function applyRepeatedTransport<T extends ParsedAttendanceDay>(days: T[]): T[] {
  const ordered = [...days].sort((left, right) => left.day - right.day);
  let lastTransport: number | null = null;
  return ordered.map((day) => {
    if (day.transportSameAsAbove) {
      return { ...day, transportYen: lastTransport };
    }
    if (day.transportYen != null) {
      lastTransport = day.transportYen;
    }
    return day;
  });
}

export function refreshDayWarnings(day: AttendanceDay): AttendanceDay {
  const calculated = actualHoursBetween(
    day.workStart,
    day.workEnd,
    day.breakStart,
    day.breakEnd,
  );
  const warnings: string[] = [];
  if (!day.cleared && day.workStart == null) {
    warnings.push("勤務開始時間が読み取れません。");
  }
  if (!day.cleared && day.workEnd == null) {
    warnings.push("勤務終了時間が読み取れません。");
  }
  if (!day.cleared && day.actualHours == null) {
    warnings.push(
      calculated == null
        ? "実働時間が読み取れません。"
        : `実働時間が読み取れません。時刻から計算すると${formatHours(calculated)}時間です。`,
    );
  } else if (actualHoursNeedReview(day)) {
    warnings.push(
      `用紙の実働は${formatHours(day.actualHours ?? 0)}時間、時刻から計算すると${formatHours(calculated ?? 0)}時間です。`,
    );
  }
  if (
    day.transportYen != null &&
    Math.round(day.transportYen) > DAILY_TRANSPORT_LIMIT_YEN
  ) {
    warnings.push(
      `交通費は1日${DAILY_TRANSPORT_LIMIT_YEN}円までのため、${Math.round(day.transportYen)}円は${DAILY_TRANSPORT_LIMIT_YEN}円として数えます。`,
    );
  }
  return { ...day, warnings };
}

export function buildAttendanceDay(input: ParsedAttendanceDay): AttendanceDay | null {
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) {
    return null;
  }
  const workStart = clockOrNull(input.workStart);
  const workEnd = clockOrNull(input.workEnd);
  const breakStart = clockOrNull(input.breakStart);
  const breakEnd = clockOrNull(input.breakEnd);
  const calculated = actualHoursBetween(workStart, workEnd, breakStart, breakEnd);
  const handwritten = roundHoursValue(input.actualHours);
  const day: AttendanceDay = {
    day: input.day,
    workStart,
    workEnd,
    breakStart,
    breakEnd,
    actualHours: handwritten,
    earlyHours: earlyHoursBetween(workStart, workEnd, breakStart, breakEnd),
    transportYen: roundYen(input.transportYen),
    note: input.note?.trim() || null,
    supervisorSigned: input.supervisorSigned,
    overtimeApproved: input.overtimeApproved,
    cleared: false,
    warnings: [],
  };
  return refreshDayWarnings(day);
}

export function toReviewSheets(sheets: ParsedAttendanceSheet[]): ReviewAttendance[] {
  return sheets.map((sheet, index) => {
    const byDay = new Map<number, AttendanceDay>();
    for (const day of applyRepeatedTransport(sheet.days)) {
      const built = buildAttendanceDay(day);
      if (built && !byDay.has(built.day)) {
        byDay.set(built.day, built);
      }
    }
    return {
      clientId: crypto.randomUUID(),
      sheetIndex: sheet.sheetIndex || index + 1,
      employeeName: cleanEmployeeName(sheet.employeeName),
      year: sheet.year,
      month: sheet.month,
      headerNote: sheet.headerNote?.trim() || null,
      days: [...byDay.values()].sort((left, right) => left.day - right.day),
      warnings: sheet.warnings,
    };
  });
}

export function updateAttendanceDay(
  day: AttendanceDay,
  patch: Partial<Omit<AttendanceDay, "warnings" | "day">>,
  timesChanged = false,
): AttendanceDay {
  const next: AttendanceDay = {
    ...day,
    ...patch,
    day: day.day,
    warnings: day.warnings,
  };
  if (timesChanged && next.workStart && next.workEnd) {
    next.earlyHours = earlyHoursBetween(
      next.workStart,
      next.workEnd,
      next.breakStart,
      next.breakEnd,
    );
  } else if (timesChanged && !next.workStart && !next.workEnd) {
    next.earlyHours = null;
  }
  return refreshDayWarnings(next);
}

export function attendanceTotals(
  days: AttendanceDay[],
  year: number | null = null,
  month: number | null = null,
): {
  workDayCount: number;
  totalHours: number;
  transportYen: number;
  weekendHolidayHours: number | null;
} {
  const offDays =
    year != null && month != null && month >= 1 && month <= 12
      ? new Set(weekendAndHolidayDays(year, month))
      : null;
  let workDayCount = 0;
  let totalHours = 0;
  let transportYen = 0;
  let weekendHolidayHours = 0;
  for (const day of days) {
    if (day.cleared) {
      continue;
    }
    const worked =
      (day.actualHours != null && day.actualHours > 0) ||
      (day.workStart != null && day.workEnd != null);
    if (worked) {
      workDayCount += 1;
    }
    if (day.actualHours != null) {
      totalHours += day.actualHours;
    }
    if (offDays?.has(day.day) && day.actualHours != null) {
      weekendHolidayHours += day.actualHours;
    }
    if (day.transportYen != null) {
      const payable = payableTransportYen(day.transportYen);
      if (payable != null && payable >= 0) {
        transportYen += payable;
      }
    }
  }
  return {
    workDayCount,
    totalHours: Math.round(totalHours * 100) / 100,
    transportYen: Math.round(transportYen),
    weekendHolidayHours:
      offDays == null ? null : Math.round(weekendHolidayHours * 100) / 100,
  };
}

export function dayHasWrite(day: AttendanceDay): boolean {
  if (day.cleared) {
    return true;
  }
  return (
    day.actualHours != null ||
    (day.earlyHours != null && day.earlyHours > 0) ||
    day.transportYen != null
  );
}

export function isAttendanceReady(sheet: ReviewAttendance): boolean {
  if (!cleanEmployeeName(sheet.employeeName)) {
    return false;
  }
  if (
    sheet.year == null ||
    sheet.year < 2000 ||
    sheet.year > 2100 ||
    sheet.month == null ||
    sheet.month < 1 ||
    sheet.month > 12
  ) {
    return false;
  }
  return sheet.days.some(dayHasWrite);
}

export function emptyAttendanceDay(day: number): AttendanceDay {
  return {
    day,
    workStart: null,
    workEnd: null,
    breakStart: null,
    breakEnd: null,
    actualHours: null,
    earlyHours: null,
    transportYen: null,
    note: null,
    supervisorSigned: null,
    overtimeApproved: null,
    cleared: false,
    warnings: [],
  };
}

export function monthLength(sheet: ReviewAttendance): number {
  if (sheet.year == null || sheet.month == null) {
    return 31;
  }
  return daysInMonth(sheet.year, sheet.month);
}

export function toWriteSheet(sheet: ReviewAttendance): AttendanceWriteSheet {
  return {
    sheetIndex: sheet.sheetIndex,
    employeeName: sheet.employeeName,
    year: sheet.year,
    month: sheet.month,
    days: sheet.days.filter(dayHasWrite).map((day) => ({
      day: day.day,
      actualHours: day.cleared ? null : day.actualHours,
      earlyHours: day.cleared ? null : day.earlyHours,
      transportYen: day.cleared ? null : payableTransportYen(day.transportYen),
      cleared: day.cleared,
    })),
  };
}
