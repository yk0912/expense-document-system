import { columnLetter } from "@/lib/accounting/sheet-column-resolver";

/** AJ列。columnLetter は0始まり。 */
export const ATTENDANCE_DAY1_COLUMN_INDEX = 35;

export function dayColumnIndex(day: number): number {
  return ATTENDANCE_DAY1_COLUMN_INDEX + day - 1;
}

export function dayColumnLetter(day: number): string {
  return columnLetter(dayColumnIndex(day));
}

export type DateHeader = {
  year: number | null;
  month: number | null;
  day: number;
  label: string;
};

export function parseSheetDateHeader(value: unknown): DateHeader | null {
  if (value == null || value === "") {
    return null;
  }
  const label = String(value).normalize("NFKC").trim();
  if (!label) {
    return null;
  }
  const ymd = label.match(
    /^(\d{4})\s*[\/\-年.]\s*(\d{1,2})\s*[\/\-月.]\s*(\d{1,2})/,
  );
  if (ymd) {
    return {
      year: Number(ymd[1]),
      month: Number(ymd[2]),
      day: Number(ymd[3]),
      label,
    };
  }
  const monthDay = label.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (monthDay) {
    return {
      year: null,
      month: Number(monthDay[1]),
      day: Number(monthDay[2]),
      label,
    };
  }
  const dayOnly = label.match(/^(\d{1,2})\s*日?(?:\s*[（(][^)）]*[)）])?$/);
  if (dayOnly && !label.includes("/") && !label.includes("月")) {
    return {
      year: null,
      month: null,
      day: Number(dayOnly[1]),
      label,
    };
  }
  return null;
}

function dateSpan(labels: string[]): number {
  let count = 0;
  for (const label of labels) {
    if (!parseSheetDateHeader(label)) {
      break;
    }
    count += 1;
  }
  return count;
}

export function findDateHeaderRow(
  rows: unknown[][],
): { header: DateHeader; labels: string[] } | null {
  let best: { header: DateHeader; labels: string[]; span: number } | null = null;
  for (const row of rows) {
    const labels = (row ?? []).map((cell) => String(cell ?? "").trim());
    const first = parseSheetDateHeader(labels[0]);
    const second = parseSheetDateHeader(labels[1]);
    if (!first || first.day !== 1 || second?.day !== 2) {
      continue;
    }
    const span = dateSpan(labels);
    if (!best || span > best.span) {
      best = { header: first, labels, span };
    }
  }
  if (best) {
    return { header: best.header, labels: best.labels };
  }
  for (const row of rows) {
    const labels = (row ?? []).map((cell) => String(cell ?? "").trim());
    const first = parseSheetDateHeader(labels[0]);
    if (first?.day === 1 && !parseSheetDateHeader(labels[1])) {
      return { header: first, labels };
    }
  }
  return null;
}

export function findDateHeader(rows: unknown[][]): DateHeader | null {
  return findDateHeaderRow(rows)?.header ?? null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function headerMismatchMessage(
  header: DateHeader | null,
  year: number,
  month: number,
): { error: string | null; warning: string | null } {
  if (!header) {
    return {
      error: null,
      warning: "日付見出しを確認できませんでした。AJ列を1日として書き込みます。",
    };
  }
  if (header.day !== 1) {
    return { error: "AJ列が月初日ではありません。", warning: null };
  }
  if (header.year != null && header.year !== year) {
    return {
      error: `このシートの日付見出しは${header.year}年です。勤務表は${year}年です。`,
      warning: null,
    };
  }
  if (header.month != null && header.month !== month) {
    return {
      error: `このシートの日付見出しは${header.month}月です。勤務表は${month}月です。`,
      warning: null,
    };
  }
  return { error: null, warning: null };
}
