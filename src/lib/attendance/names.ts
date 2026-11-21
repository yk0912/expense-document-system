export function normalizePersonName(value: string): string {
  return value.normalize("NFKC").replace(/[\s\u3000\u00A0]+/g, "");
}

export function cleanEmployeeName(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.normalize("NFKC").trim().replace(/様$/u, "").trim();
}

export type NameCell = {
  rowNumber: number;
  name: string;
};

/** C列。columnLetter は0始まり。 */
export const ATTENDANCE_NAME_COLUMN_INDEX = 2;
/** 氏名の先頭行。以降は3行ごと。 */
export const FIRST_ATTENDANCE_PERSON_ROW = 9;

export type PersonRowMiss =
  | { ok: false; reason: "empty" | "missing" | "duplicate" | "conflict"; error: string };

export function findPersonRow(
  cells: NameCell[],
  employeeName: string,
): { ok: true; rowNumber: number } | PersonRowMiss {
  const needle = normalizePersonName(cleanEmployeeName(employeeName));
  if (!needle) {
    return { ok: false, reason: "empty", error: "氏名を入力してください。" };
  }
  const matches = cells.filter((cell) => normalizePersonName(cell.name) === needle);
  if (matches.length === 0) {
    return {
      ok: false,
      reason: "missing",
      error: `「${cleanEmployeeName(employeeName)}」がC列にありません。`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "duplicate",
      error: `「${cleanEmployeeName(employeeName)}」が複数行にあります（${matches
        .map((cell) => `${cell.rowNumber}行目`)
        .join("、")}）。`,
    };
  }
  const rowNumber = matches[0]?.rowNumber;
  if (rowNumber == null) {
    return { ok: false, reason: "missing", error: "氏名の行を特定できませんでした。" };
  }
  const blockNames = cells.filter(
    (cell) =>
      cell.rowNumber === rowNumber + 1 || cell.rowNumber === rowNumber + 2,
  );
  const conflict = blockNames.find(
    (cell) => normalizePersonName(cell.name) !== needle && normalizePersonName(cell.name) !== "",
  );
  if (conflict) {
    return {
      ok: false,
      reason: "conflict",
      error: `${rowNumber}行目の次の行に別の氏名（${conflict.name}）があります。3行ごとの並びを確認してください。`,
    };
  }
  return { ok: true, rowNumber };
}

/** 一覧の末尾より下で、氏名と続く2行が空いている3行ブロック。 */
export function nextBlankPersonRow(cells: NameCell[]): number | null {
  const occupied = new Set(cells.map((cell) => cell.rowNumber));
  const personRows = workHourRows(cells).filter((row) => row >= FIRST_ATTENDANCE_PERSON_ROW);
  const last = personRows.length > 0 ? Math.max(...personRows) : FIRST_ATTENDANCE_PERSON_ROW - 3;
  let row = last + 3;
  const remainder = (row - FIRST_ATTENDANCE_PERSON_ROW) % 3;
  if (remainder !== 0) {
    row += 3 - remainder;
  }
  while (row <= 1497) {
    if (![row, row + 1, row + 2].some((candidate) => occupied.has(candidate))) {
      return row;
    }
    row += 3;
  }
  return null;
}

/** 勤務時間の行。氏名は3行ごとに並び、直後に別の氏名がある見出し行は除く。 */
export function workHourRows(cells: NameCell[]): number[] {
  const rows = [...new Set(cells.map((cell) => cell.rowNumber))].sort(
    (left, right) => left - right,
  );
  return rows.filter((row, index) => {
    const next = rows[index + 1];
    return next == null || next - row >= 3;
  });
}
