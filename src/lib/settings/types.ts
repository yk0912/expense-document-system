import { DEFAULT_USERS_SHEET_NAME } from "@/lib/auth/constants";

export const ISSUE_SHEET_NAME = "登録不良";
export const FORMAT_SHEET_NAME = "フォーマット";
export const SETTINGS_FILE_NAME = "経費アプリ設定.json";

export type AppSettings = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  categorySheetName: string;
  driveFolderId: string;
  issueSheetName: string;
  usersSpreadsheetId: string;
  usersSheetName: string;
};

export const EMPTY_SETTINGS: AppSettings = {
  spreadsheetId: "",
  spreadsheetUrl: "",
  sheetName: "経費集計",
  categorySheetName: "経費区分の説明",
  driveFolderId: "",
  issueSheetName: ISSUE_SHEET_NAME,
  usersSpreadsheetId: "",
  usersSheetName: DEFAULT_USERS_SHEET_NAME,
};
