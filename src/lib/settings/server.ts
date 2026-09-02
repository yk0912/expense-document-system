import { loadServerEnv, missingGoogleAuthKeys } from "@/lib/env";
import { DEFAULT_USERS_SHEET_NAME } from "@/lib/auth/constants";
import { createMemoryTtlCache } from "@/lib/cache/memory-ttl";
import { createGoogleOAuthClient } from "@/lib/google/auth";
import { readJsonFile, writeJsonFile } from "@/lib/google/drive";
import {
  parseDriveFolderId,
  parseSpreadsheetId,
  spreadsheetUrlFromId,
} from "@/lib/settings/parse";
import {
  EMPTY_SETTINGS,
  SETTINGS_FILE_NAME,
  type AppSettings,
} from "@/lib/settings/types";

const settingsCache = createMemoryTtlCache<AppSettings>(60 * 1000);

async function envSettings(): Promise<AppSettings> {
  const env = await loadServerEnv();
  const spreadsheetId = env.googleSpreadsheetId;
  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrlFromId(spreadsheetId),
    sheetName: env.googleSheetName || EMPTY_SETTINGS.sheetName,
    categorySheetName: env.googleCategorySheetName || EMPTY_SETTINGS.categorySheetName,
    driveFolderId: env.googleDriveFolderId,
    issueSheetName: EMPTY_SETTINGS.issueSheetName,
    usersSpreadsheetId: spreadsheetId,
    usersSheetName: DEFAULT_USERS_SHEET_NAME,
  };
}

function pickFilled(
  base: AppSettings,
  overlay: Partial<AppSettings> | null | undefined,
): AppSettings {
  if (!overlay) {
    return base;
  }
  const spreadsheetId =
    parseSpreadsheetId(overlay.spreadsheetId ?? "") ||
    parseSpreadsheetId(overlay.spreadsheetUrl ?? "") ||
    base.spreadsheetId;
  return {
    spreadsheetId,
    spreadsheetUrl:
      overlay.spreadsheetUrl?.trim() ||
      spreadsheetUrlFromId(spreadsheetId) ||
      base.spreadsheetUrl,
    sheetName: overlay.sheetName?.trim() || base.sheetName,
    categorySheetName: overlay.categorySheetName?.trim() || base.categorySheetName,
    driveFolderId: overlay.driveFolderId?.trim() || base.driveFolderId,
    issueSheetName: overlay.issueSheetName?.trim() || base.issueSheetName,
    usersSpreadsheetId:
      parseSpreadsheetId(overlay.usersSpreadsheetId ?? "") || base.usersSpreadsheetId,
    usersSheetName: overlay.usersSheetName?.trim() || base.usersSheetName,
  };
}

function headerValue(request: Request, name: string): string {
  const raw = request.headers.get(name)?.trim() ?? "";
  if (!raw) {
    return "";
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
  const auth = await createGoogleOAuthClient();
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
    const merged = pickFilled(await envSettings(), stored);
    settingsCache.set(folderId, merged);
    return stored;
  } catch {
    return null;
  }
}

export async function resolveAppSettings(request?: Request): Promise<AppSettings> {
  const env = await envSettings();
  const headerSettings = request ? settingsFromHeaders(request) : {};
  const folderId = headerSettings.driveFolderId || env.driveFolderId;
  const stored = await readStoredSettings(folderId);
  return pickFilled(pickFilled(env, stored), headerSettings);
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
  const auth = await createGoogleOAuthClient();
  if (!auth) {
    const missing = missingGoogleAuthKeys();
    throw new Error(
      missing.length > 0
        ? `Google認証情報が未設定です。（${missing.join("、")}）`
        : "Google認証情報が未設定です。",
    );
  }
  if (!next.driveFolderId) {
    throw new Error("親フォルダIDが未設定です。システム設定で指定してください。");
  }
  const spreadsheetId =
    parseSpreadsheetId(next.spreadsheetId) ||
    parseSpreadsheetId(next.spreadsheetUrl);
  const normalized: AppSettings = {
    spreadsheetId,
    spreadsheetUrl: next.spreadsheetUrl.trim() || spreadsheetUrlFromId(spreadsheetId),
    sheetName: next.sheetName.trim() || EMPTY_SETTINGS.sheetName,
    categorySheetName:
      next.categorySheetName.trim() || EMPTY_SETTINGS.categorySheetName,
    driveFolderId: parseDriveFolderId(next.driveFolderId),
    issueSheetName: EMPTY_SETTINGS.issueSheetName,
    usersSpreadsheetId:
      parseSpreadsheetId(next.usersSpreadsheetId) || spreadsheetId,
    usersSheetName: next.usersSheetName.trim() || DEFAULT_USERS_SHEET_NAME,
  };
  await writeJsonFile(auth, normalized.driveFolderId, SETTINGS_FILE_NAME, normalized);
  settingsCache.set(normalized.driveFolderId, normalized);
  return normalized;
}
