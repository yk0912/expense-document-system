"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSettings } from "@/components/settings/SettingsProvider";
import { appFetch } from "@/lib/settings/client";
import { parseSpreadsheetId } from "@/lib/settings/parse";
import type { AppSettings } from "@/lib/settings/types";

export function DestinationSettingsScreen() {
  const { settings, setSettings } = useAppSettings();
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const spreadsheetIdValue = spreadsheetId ?? settings.spreadsheetId;
  const sheetNameValue = sheetName ?? settings.sheetName;

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await appFetch("/api/settings/destination", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: parseSpreadsheetId(spreadsheetIdValue),
          sheetName: sheetNameValue,
        }),
      });
      const payload = (await response.json()) as AppSettings & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存に失敗しました。");
      }
      setSettings(payload);
      setSpreadsheetId(null);
      setSheetName(null);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">設定</p>
        <h1 className="text-2xl font-semibold tracking-tight">登録先設定</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          経費を転記するスプレッドシートと、集計シート名を指定します。読み取り不良の報告も同じブックの「読み取り不良」シートに溜まります。
        </p>
      </header>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">スプレッドシートIDまたはURL</span>
        <Input
          className="h-11"
          value={spreadsheetIdValue}
          onChange={(event) => {
            setSpreadsheetId(event.target.value);
            setSaved(false);
          }}
          autoComplete="off"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">シート名</span>
        <Input
          className="h-11"
          value={sheetNameValue}
          onChange={(event) => {
            setSheetName(event.target.value);
            setSaved(false);
          }}
        />
      </label>

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">保存しました。</p> : null}

      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={saving || !spreadsheetIdValue.trim() || !sheetNameValue.trim()}
        onClick={() => void handleSave()}
      >
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
