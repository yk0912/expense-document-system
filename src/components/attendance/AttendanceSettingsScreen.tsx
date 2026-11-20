"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAppSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appFetch } from "@/lib/settings/client";
import { parseSpreadsheetId, spreadsheetUrlFromId } from "@/lib/settings/parse";
import type { AppSettings } from "@/lib/settings/types";

export function AttendanceSettingsScreen() {
  const { settings, setSettings } = useAppSettings();
  const [idInput, setIdInput] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [titlesForId, setTitlesForId] = useState("");
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [excelFile, setExcelFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idValue = idInput ?? settings.attendanceSpreadsheetId;
  const parsedId = parseSpreadsheetId(idValue);
  const sheetsReady = titlesForId === parsedId && titles.length > 0;
  const preferredSheet = sheetName ?? settings.attendanceSheetName;
  const selectedSheet = sheetsReady && titles.includes(preferredSheet) ? preferredSheet : "";
  const spreadsheetUrl = spreadsheetUrlFromId(parsedId);

  const loadSheets = async (rawId: string) => {
    const spreadsheetId = parseSpreadsheetId(rawId);
    if (!spreadsheetId) {
      setError("スプレッドシートIDを入力してください。");
      return;
    }
    setLoadingSheets(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await appFetch(
        `/api/attendance/sheets?spreadsheetId=${encodeURIComponent(spreadsheetId)}`,
      );
      const payload = (await response.json()) as {
        titles?: string[];
        excel?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.titles) {
        throw new Error(payload.error ?? "シート一覧を読み取れませんでした。");
      }
      setTitles(payload.titles);
      setTitlesForId(spreadsheetId);
      setExcelFile(Boolean(payload.excel));
      setSheetName((current) => {
        const currentName = current ?? settings.attendanceSheetName;
        return payload.titles?.includes(currentName) ? currentName : "";
      });
    } catch (loadError) {
      setTitles([]);
      setTitlesForId("");
      setExcelFile(false);
      setError(
        loadError instanceof Error ? loadError.message : "シート一覧を読み取れませんでした。",
      );
    } finally {
      setLoadingSheets(false);
    }
  };

  useEffect(() => {
    if (!settings.attendanceSpreadsheetId) {
      return;
    }
    void loadSheets(settings.attendanceSpreadsheetId);
    // 保存済みIDのシート一覧は画面を開いたときだけ読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.attendanceSpreadsheetId]);

  const handleSave = async () => {
    if (!parsedId || !selectedSheet) {
      setError("スプレッドシートIDとシート名を選んでください。");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await appFetch("/api/settings/attendance-destination", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: parsedId,
          sheetName: selectedSheet,
        }),
      });
      const payload = (await response.json()) as AppSettings & {
        error?: string;
        converted?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存に失敗しました。");
      }
      const { converted, ...stored } = payload;
      setSettings(stored);
      setIdInput(null);
      setSheetName(selectedSheet);
      setExcelFile(false);
      setSavedMessage(
        payload.converted
          ? "ExcelをGoogleスプレッドシートに変換し、そのコピーを転記先として保存しました。"
          : "保存しました。",
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">勤怠表</p>
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          勤務実績を書き込むスプレッドシートのIDを入力し、登録先のシート名を選んで保存します。
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">スプレッドシートIDまたはURL</span>
          <Input
            className="h-11"
            value={idValue}
            onChange={(event) => {
              setIdInput(event.target.value);
              setSavedMessage(null);
            }}
            autoComplete="off"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={loadingSheets || !parsedId}
          onClick={() => void loadSheets(idValue)}
        >
          {loadingSheets ? "読み込み中…" : "シート名を読み込む"}
        </Button>
        {idValue.trim() && !parsedId ? (
          <p className="text-sm text-destructive">
            スプレッドシートのURLからIDを読み取れません。
          </p>
        ) : null}
        {error ? <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p> : null}
        {sheetsReady ? (
          <p className="text-sm">{titles.length}件のシートを読み込みました。一覧から選んでください。</p>
        ) : null}
        {sheetsReady && excelFile ? (
          <p className="text-sm leading-6 text-muted-foreground">
            このファイルは Excel です。保存すると Googleスプレッドシートに変換したコピーを転記先にします。
          </p>
        ) : null}
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">登録先のシート名</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base disabled:cursor-not-allowed disabled:bg-input/50"
            value={selectedSheet}
            disabled={!sheetsReady || loadingSheets}
            onChange={(event) => {
              setSheetName(event.target.value);
              setSavedMessage(null);
            }}
          >
            <option value="">
              {sheetsReady ? "シートを選んでください" : "先にシート名を読み込んでください"}
            </option>
            {sheetsReady
              ? titles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))
              : null}
          </select>
        </label>
        {spreadsheetUrl ? (
          <a
            href={spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-sm underline"
          >
            {spreadsheetUrl}
          </a>
        ) : null}
        <Button
          type="button"
          className="h-11 w-full"
          disabled={saving || !sheetsReady || !selectedSheet}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
        {savedMessage ? <p className="text-sm">{savedMessage}</p> : null}
      </section>

      <Link href="/attendance/new" className="text-center text-sm text-primary underline">
        勤怠表の読み取りへ戻る
      </Link>
    </div>
  );
}
