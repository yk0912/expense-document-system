"use client";

import { useEffect, useState } from "react";

import { useAppSettings } from "@/components/settings/SettingsProvider";
import { spreadsheetUrlFromId } from "@/lib/settings/parse";
import { buildUserReceiptSheetName } from "@/lib/settings/receipt-sheet";

export function DestinationSettingsScreen() {
  const { settings } = useAppSettings();
  const [userName, setUserName] = useState<string | null>(null);
  const spreadsheetUrl =
    settings.spreadsheetUrl || spreadsheetUrlFromId(settings.spreadsheetId);
  const sheetTitle = userName
    ? buildUserReceiptSheetName(settings.sheetName, userName)
    : null;

  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) => (await response.json()) as { name?: string } | null)
      .then((payload) => {
        setUserName(payload?.name ?? null);
      });
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">設定</p>
        <h1 className="text-2xl font-semibold tracking-tight">登録先設定</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          経費は「フォーマット」をコピーしたユーザー別シート（シート名_ユーザー名）へ転記します。すでに同じ名前のシートがあれば、一番下の空白行に追記します。書き込み先ブックとシート名はシステム設定で管理者だけが変更できます。
        </p>
      </header>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">書き込み先スプレッドシート</h2>
        {spreadsheetUrl ? (
          <a
            href={spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-sm underline"
          >
            {spreadsheetUrl}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">未設定</p>
        )}
        <p className="text-sm text-muted-foreground">
          登録シート: {sheetTitle || "未設定"}
        </p>
      </section>
    </div>
  );
}
