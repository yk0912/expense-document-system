"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSettings } from "@/components/settings/SettingsProvider";
import { appFetch } from "@/lib/settings/client";
import { parseDriveFolderId } from "@/lib/settings/parse";
import type { AppSettings } from "@/lib/settings/types";

export function SystemSettingsScreen() {
  const { settings, setSettings } = useAppSettings();
  const [password, setPassword] = useState("");
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const driveFolderIdValue = driveFolderId ?? settings.driveFolderId;

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await appFetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          driveFolderId: parseDriveFolderId(driveFolderIdValue),
        }),
      });
      const payload = (await response.json()) as AppSettings & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存に失敗しました。");
      }
      setSettings(payload);
      setDriveFolderId(null);
      setUnlocked(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">システム設定</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          レシート画像と読み取り不良の写真を置くGoogleドライブの親フォルダを指定します。変更にはパスワードが必要です。
        </p>
      </header>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">パスワード</span>
        <Input
          className="h-11"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setUnlocked(Boolean(event.target.value));
            setSaved(false);
          }}
          autoComplete="current-password"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">親フォルダIDまたはURL</span>
        <Input
          className="h-11"
          value={driveFolderIdValue}
          disabled={!unlocked && Boolean(settings.driveFolderId)}
          onChange={(event) => {
            setDriveFolderId(event.target.value);
            setSaved(false);
          }}
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">保存しました。</p> : null}

      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={saving || !driveFolderIdValue.trim()}
        onClick={() => void handleSave()}
      >
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
