"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  loadLocalSettings,
  saveLocalSettings,
} from "@/lib/settings/client";
import { EMPTY_SETTINGS, type AppSettings } from "@/lib/settings/types";

type SettingsContextValue = {
  settings: AppSettings;
  ready: boolean;
  setSettings: (next: AppSettings) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(EMPTY_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const local = loadLocalSettings();
    void fetch("/api/settings", {
      headers: {
        "x-app-spreadsheet-id": local.spreadsheetId,
        "x-app-sheet-name": local.sheetName,
        "x-app-drive-folder-id": local.driveFolderId,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          return local;
        }
        return (await response.json()) as AppSettings;
      })
      .then((remote) => {
        const merged: AppSettings = {
          spreadsheetId: local.spreadsheetId || remote.spreadsheetId,
          sheetName: local.sheetName || remote.sheetName,
          categorySheetName: local.categorySheetName || remote.categorySheetName,
          driveFolderId: local.driveFolderId || remote.driveFolderId,
          issueSheetName: local.issueSheetName || remote.issueSheetName,
        };
        saveLocalSettings(merged);
        setSettingsState(merged);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      settings,
      ready,
      setSettings: (next: AppSettings) => {
        saveLocalSettings(next);
        setSettingsState(next);
      },
    }),
    [ready, settings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useAppSettings() {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("SettingsProvider がありません。");
  }
  return value;
}
