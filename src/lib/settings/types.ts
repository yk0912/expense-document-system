export const ISSUE_SHEET_NAME = "読み取り不良";
export const SETTINGS_FILE_NAME = "経費アプリ設定.json";

export type AppSettings = {
  spreadsheetId: string;
  sheetName: string;
  categorySheetName: string;
  driveFolderId: string;
  issueSheetName: string;
};

export const EMPTY_SETTINGS: AppSettings = {
  spreadsheetId: "",
  sheetName: "経費集計",
  categorySheetName: "経費区分の説明",
  driveFolderId: "",
  issueSheetName: ISSUE_SHEET_NAME,
};
