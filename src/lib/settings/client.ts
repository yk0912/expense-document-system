"use client";

import { EMPTY_SETTINGS, type AppSettings } from "@/lib/settings/types";

const STORAGE_KEY = "expense-app-settings";

export function loadLocalSettings(): AppSettings {
  if (typeof window === "undefined") {
    return EMPTY_SETTINGS;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return EMPTY_SETTINGS;
  }
  try {
    return { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveLocalSettings(settings: AppSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function settingsHeaders(settings: AppSettings): HeadersInit {
  return {
    "x-app-spreadsheet-id": settings.spreadsheetId,
    "x-app-sheet-name": settings.sheetName,
    "x-app-drive-folder-id": settings.driveFolderId,
  };
}

export async function appFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const settings = loadLocalSettings();
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(settingsHeaders(settings))) {
    if (value && !headers.has(key)) {
      headers.set(key, value);
    }
  }
  return fetch(input, { ...init, headers });
}
