import { createMemoryTtlCache } from "@/lib/cache/memory-ttl";
import { createGoogleOAuthClient } from "@/lib/google/auth";
import { readJsonFile, writeJsonFile } from "@/lib/google/drive";
import { parseDriveFolderId, parseSpreadsheetId } from "@/lib/settings/parse";
import {
  EMPTY_SETTINGS,
  SETTINGS_FILE_NAME,
  type AppSettings,
} from "@/lib/settings/types";

const settingsCache = createMemoryTtlCache<AppSettings>(60 * 1000);

function envSettings(): AppSettings {
  return {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID?.trim() ?? "",
    sheetName: process.env.GOOGLE_SHEET_NAME?.trim() || EMPTY_SETTINGS.sheetName,
    categorySheetName:
      process.env.GOOGLE_CATEGORY_SHEET_NAME?.trim() ||
      EMPTY_SETTINGS.categorySheetName,
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? "",
    issueSheetName: EMPTY_SETTINGS.issueSheetName,
  };
}

function pickFilled(
  base: AppSettings,
  overlay: Partial<AppSettings> | null | undefined,
): AppSettings {
  if (!overlay) {
    return base;
  }
  return {
    spreadsheetId: overlay.spreadsheetId?.trim() || base.spreadsheetId,
    sheetName: overlay.sheetName?.trim() || base.sheetName,
    categorySheetName: overlay.categorySheetName?.trim() || base.categorySheetName,
    driveFolderId: overlay.driveFolderId?.trim() || base.driveFolderId,
    issueSheetName: overlay.issueSheetName?.trim() || base.issueSheetName,
  };
}

function headerValue(request: Request, name: string): string {
  return request.headers.get(name)?.trim() ?? "";
}

export function settingsFromHeaders(request: Request): Partial<AppSettings> {
  return {
    spreadsheetId: parseSpreadsheetId(headerValue(request, "x-app-spreadsheet-id")),
    sheetName: headerValue(request, "x-app-sheet-name"),
    driveFolderId: parseDriveFolderId(headerValue(request, "x-app-drive-folder-id")),
  };
}

async function readStoredSettings(folderId: string): Promise<Partial<AppSettings> | null> {
  if (!folderId) {
    return null;
  }
  const cached = settingsCache.get(folderId);
  if (cached) {
    return cached;
  }
  const auth = createGoogleOAuthClient();
  if (!auth) {
    return null;
  }
  try {
    const stored = await readJsonFile<Partial<AppSettings>>(
      auth,
      folderId,
      SETTINGS_FILE_NAME,
    );
    if (!stored) {
      return null;
    }
    const merged = pickFilled(envSettings(), stored);
    settingsCache.set(folderId, merged);
    return stored;
  } catch {
    return null;
  }
}

export async function resolveAppSettings(request?: Request): Promise<AppSettings> {
  const env = envSettings();
  const headerSettings = request ? settingsFromHeaders(request) : {};
  const folderId = headerSettings.driveFolderId || env.driveFolderId;
  const stored = await readStoredSettings(folderId);
  return pickFilled(pickFilled(env, stored), headerSettings);
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
  const auth = createGoogleOAuthClient();
  if (!auth) {
    throw new Error("Google認証情報が未設定です。");
  }
  if (!next.driveFolderId) {
    throw new Error("親フォルダIDが未設定です。システム設定で指定してください。");
  }
  const normalized: AppSettings = {
    spreadsheetId: parseSpreadsheetId(next.spreadsheetId),
    sheetName: next.sheetName.trim() || EMPTY_SETTINGS.sheetName,
    categorySheetName:
      next.categorySheetName.trim() || EMPTY_SETTINGS.categorySheetName,
    driveFolderId: parseDriveFolderId(next.driveFolderId),
    issueSheetName: next.issueSheetName.trim() || EMPTY_SETTINGS.issueSheetName,
  };
  await writeJsonFile(auth, normalized.driveFolderId, SETTINGS_FILE_NAME, normalized);
  settingsCache.set(normalized.driveFolderId, normalized);
  return normalized;
}
