import { connection } from "next/server";

export type ServerEnv = {
  geminiApiKey: string;
  geminiModel: string;
  geminiThinkingLevel: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleSpreadsheetId: string;
  googleDriveFolderId: string;
  googleSheetName: string;
  googleCategorySheetName: string;
  adminPassword: string;
};

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

export async function loadServerEnv(): Promise<ServerEnv> {
  await connection();
  return {
    geminiApiKey: trim(process.env.GEMINI_API_KEY),
    geminiModel: trim(process.env.GEMINI_MODEL),
    geminiThinkingLevel: trim(process.env.GEMINI_THINKING_LEVEL),
    googleClientId: trim(process.env.GOOGLE_CLIENT_ID),
    googleClientSecret: trim(process.env.GOOGLE_CLIENT_SECRET),
    googleRefreshToken: trim(process.env.GOOGLE_REFRESH_TOKEN),
    googleSpreadsheetId: trim(process.env.GOOGLE_SPREADSHEET_ID),
    googleDriveFolderId: trim(process.env.GOOGLE_DRIVE_FOLDER_ID),
    googleSheetName: trim(process.env.GOOGLE_SHEET_NAME),
    googleCategorySheetName: trim(process.env.GOOGLE_CATEGORY_SHEET_NAME),
    adminPassword: trim(process.env.ADMIN_PASSWORD),
  };
}
