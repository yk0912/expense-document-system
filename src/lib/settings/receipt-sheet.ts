export function buildUserReceiptSheetName(
  baseSheetName: string,
  userName: string,
): string {
  const base = baseSheetName.trim() || "経費集計";
  const user = userName.trim() || "user";
  const sanitized = `${base}_${user}`.replace(/[:\\/?*[\]']/g, "");
  return sanitized.slice(0, 100);
}
