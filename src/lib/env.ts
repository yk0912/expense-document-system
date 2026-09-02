import nodeProcess from "node:process";

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

const KEYS = {
  geminiApiKey: "GEMINI_API_KEY",
  geminiModel: "GEMINI_MODEL",
  geminiThinkingLevel: "GEMINI_THINKING_LEVEL",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  googleRefreshToken: "GOOGLE_REFRESH_TOKEN",
  googleSpreadsheetId: "GOOGLE_SPREADSHEET_ID",
  googleDriveFolderId: "GOOGLE_DRIVE_FOLDER_ID",
  googleSheetName: "GOOGLE_SHEET_NAME",
  googleCategorySheetName: "GOOGLE_CATEGORY_SHEET_NAME",
  adminPassword: "ADMIN_PASSWORD",
} as const;

function read(name: string): string {
  const value = nodeProcess.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function loadServerEnv(): ServerEnv {
  return {
    geminiApiKey: read(KEYS.geminiApiKey),
    geminiModel: read(KEYS.geminiModel),
    geminiThinkingLevel: read(KEYS.geminiThinkingLevel),
    googleClientId: read(KEYS.googleClientId),
    googleClientSecret: read(KEYS.googleClientSecret),
    googleRefreshToken: read(KEYS.googleRefreshToken),
    googleSpreadsheetId: read(KEYS.googleSpreadsheetId),
    googleDriveFolderId: read(KEYS.googleDriveFolderId),
    googleSheetName: read(KEYS.googleSheetName),
    googleCategorySheetName: read(KEYS.googleCategorySheetName),
    adminPassword: read(KEYS.adminPassword),
  };
}

export function missingGoogleAuthKeys(env: ServerEnv = loadServerEnv()): string[] {
  const missing: string[] = [];
  if (!env.googleClientId) {
    missing.push(KEYS.googleClientId);
  }
  if (!env.googleClientSecret) {
    missing.push(KEYS.googleClientSecret);
  }
  if (!env.googleRefreshToken) {
    missing.push(KEYS.googleRefreshToken);
  }
  return missing;
}
