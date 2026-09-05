"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  loadLocalSettings,
  saveLocalSettings,
  settingsHeaders,
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
      headers: settingsHeaders(local),
    })
      .then(async (response) => {
        if (!response.ok) {
          return local;
        }
        return (await response.json()) as AppSettings;
      })
      .then((remote) => {
        const merged: AppSettings = {
          spreadsheetId: remote.spreadsheetId || local.spreadsheetId,
          spreadsheetUrl: remote.spreadsheetUrl || local.spreadsheetUrl,
          sheetName: remote.sheetName || local.sheetName,
          categorySheetName: remote.categorySheetName || local.categorySheetName,
          driveFolderId: remote.driveFolderId || local.driveFolderId,
          issueSheetName: remote.issueSheetName || local.issueSheetName,
          usersSpreadsheetId: remote.usersSpreadsheetId || local.usersSpreadsheetId,
          usersSheetName: remote.usersSheetName || local.usersSheetName,
          geminiModel: remote.geminiModel || local.geminiModel,
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
