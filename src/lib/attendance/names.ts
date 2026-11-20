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

export function findPersonRow(
  cells: NameCell[],
  employeeName: string,
): { ok: true; rowNumber: number } | { ok: false; error: string } {
  const needle = normalizePersonName(cleanEmployeeName(employeeName));
  if (!needle) {
    return { ok: false, error: "氏名を入力してください。" };
  }
  const matches = cells.filter((cell) => normalizePersonName(cell.name) === needle);
  if (matches.length === 0) {
    return {
      ok: false,
      error: `「${cleanEmployeeName(employeeName)}」がC列にありません。`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `「${cleanEmployeeName(employeeName)}」が複数行にあります（${matches
        .map((cell) => `${cell.rowNumber}行目`)
        .join("、")}）。`,
    };
  }
  const rowNumber = matches[0]?.rowNumber;
  if (rowNumber == null) {
    return { ok: false, error: "氏名の行を特定できませんでした。" };
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
      error: `${rowNumber}行目の次の行に別の氏名（${conflict.name}）があります。3行ごとの並びを確認してください。`,
    };
  }
  return { ok: true, rowNumber };
}
