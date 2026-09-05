"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSettings } from "@/components/settings/SettingsProvider";
import {
  CUSTOM_GEMINI_MODEL,
  isKnownGeminiModel,
  type GeminiModelOption,
} from "@/lib/ai/gemini-models";
import { ADMIN_USER_NAME } from "@/lib/auth/constants";
import { appFetch } from "@/lib/settings/client";
import { parseSpreadsheetId, spreadsheetUrlFromId } from "@/lib/settings/parse";
import type { AppSettings } from "@/lib/settings/types";

type PublicUser = { name: string; role: "admin" | "user" };
type EditableUser = PublicUser & { clientId: string };

function createClientId() {
  return crypto.randomUUID();
}

function toEditableUsers(users: PublicUser[]): EditableUser[] {
  return users.map((user) => ({ ...user, clientId: createClientId() }));
}

export function SystemSettingsScreen() {
  const { settings, setSettings } = useAppSettings();
  const [password, setPassword] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [usersSpreadsheetId, setUsersSpreadsheetId] = useState<string | null>(null);
  const [usersSheetName, setUsersSheetName] = useState<string | null>(null);
  const [geminiModel, setGeminiModel] = useState<string | null>(null);
  const [geminiModels, setGeminiModels] = useState<GeminiModelOption[]>([]);
  const [geminiModelsError, setGeminiModelsError] = useState<string | null>(null);
  const [users, setUsers] = useState<EditableUser[] | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!password) {
      setUnlocked(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/settings/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        signal: controller.signal,
      })
        .then((response) => {
          setUnlocked(response.ok);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setUnlocked(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [password]);

  useEffect(() => {
    void fetch("/api/auth/users")
      .then(async (response) => (await response.json()) as { users?: PublicUser[] })
      .then((payload) => {
        setUsers(
          toEditableUsers(payload.users ?? [{ name: ADMIN_USER_NAME, role: "admin" }]),
        );
      });
    void fetch("/api/settings/gemini-models")
      .then(async (response) => {
        const payload = (await response.json()) as {
          models?: GeminiModelOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Geminiのモデル一覧を取得できませんでした。");
        }
        return payload;
      })
      .then((payload) => {
        setGeminiModels(payload.models ?? []);
        setGeminiModelsError(null);
      })
      .catch((loadError: unknown) => {
        setGeminiModels([]);
        setGeminiModelsError(
          loadError instanceof Error
            ? loadError.message
            : "Geminiのモデル一覧を取得できませんでした。",
        );
      });
  }, []);

  const spreadsheetIdValue = spreadsheetId ?? settings.spreadsheetId;
  const spreadsheetUrlValue = spreadsheetUrl ?? settings.spreadsheetUrl;
  const sheetNameValue = sheetName ?? settings.sheetName;
  const usersSpreadsheetIdValue = usersSpreadsheetId ?? settings.usersSpreadsheetId;
  const usersSheetNameValue = usersSheetName ?? settings.usersSheetName;
  const geminiModelValue = geminiModel ?? settings.geminiModel;
  const geminiSelectValue = isKnownGeminiModel(geminiModelValue, geminiModels)
    ? geminiModelValue
    : CUSTOM_GEMINI_MODEL;

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
          spreadsheetId: parseSpreadsheetId(spreadsheetIdValue || spreadsheetUrlValue),
          spreadsheetUrl: spreadsheetUrlValue || spreadsheetUrlFromId(spreadsheetIdValue),
          sheetName: sheetNameValue,
          usersSpreadsheetId: parseSpreadsheetId(usersSpreadsheetIdValue),
          usersSheetName: usersSheetNameValue,
          geminiModel: geminiModelValue,
        }),
      });
      const payload = (await response.json()) as AppSettings & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存に失敗しました。");
      }
      setSettings(payload);
      setSpreadsheetId(null);
      setSpreadsheetUrl(null);
      setSheetName(null);
      setUsersSpreadsheetId(null);
      setUsersSheetName(null);
      setGeminiModel(null);
      if (users) {
        const usersResponse = await appFetch("/api/auth/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password,
            users: users.map(({ name, role }) => ({ name, role })),
          }),
        });
        const usersPayload = (await usersResponse.json()) as {
          users?: PublicUser[];
          error?: string;
        };
        if (!usersResponse.ok) {
          throw new Error(usersPayload.error ?? "ユーザーの保存に失敗しました。");
        }
        setUsers(
          usersPayload.users ? toEditableUsers(usersPayload.users) : users,
        );
      }
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
      </header>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">ロック解除パスワード</span>
        <Input
          className="h-11"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setSaved(false);
          }}
          autoComplete="current-password"
        />
      </label>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">書き込み先スプレッドシート</h2>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">スプレッドシートID</span>
          <Input
            className="h-11"
            value={spreadsheetIdValue}
            disabled={!unlocked}
            onChange={(event) => {
              const value = event.target.value;
              setSpreadsheetId(value);
              setSpreadsheetUrl(spreadsheetUrlFromId(value));
              setSaved(false);
            }}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">スプレッドシートURL</span>
          <Input
            className="h-11"
            value={spreadsheetUrlValue}
            disabled={!unlocked}
            onChange={(event) => {
              const value = event.target.value;
              setSpreadsheetUrl(value);
              setSpreadsheetId(parseSpreadsheetId(value));
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
            disabled={!unlocked}
            onChange={(event) => {
              setSheetName(event.target.value);
              setSaved(false);
            }}
            autoComplete="off"
          />
          <span className="block text-xs leading-5 text-muted-foreground">
            登録時は「フォーマット」シートをコピーし、この名前とログイン名をアンダースコアでつないだシート（シート名_ログイン名）へ書き込みます。同じ名前のシートがあれば、そのシートの一番下に追記します。
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">レシート読み取り</h2>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Geminiモデル</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={geminiSelectValue}
            disabled={!unlocked}
            onChange={(event) => {
              const value = event.target.value;
              setGeminiModel(value === CUSTOM_GEMINI_MODEL ? "" : value);
              setSaved(false);
            }}
          >
            {geminiModels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            <option value={CUSTOM_GEMINI_MODEL}>その他（手入力）</option>
          </select>
        </label>
        {geminiSelectValue === CUSTOM_GEMINI_MODEL ? (
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">モデルID</span>
            <Input
              className="h-11"
              value={geminiModelValue}
              disabled={!unlocked}
              placeholder="gemini-3.5-flash-lite"
              onChange={(event) => {
                setGeminiModel(event.target.value);
                setSaved(false);
              }}
              autoComplete="off"
            />
          </label>
        ) : null}
        {geminiModelsError ? (
          <p className="text-sm text-destructive">{geminiModelsError}</p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          この環境の API キーで generateContent できるモデルです。Gemini 2.5 は新規キーでは 404 になるため出していません。
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">ユーザー・パスワードの記録先</h2>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">スプレッドシートIDまたはURL</span>
          <Input
            className="h-11"
            value={usersSpreadsheetIdValue}
            disabled={!unlocked}
            onChange={(event) => {
              setUsersSpreadsheetId(parseSpreadsheetId(event.target.value));
              setSaved(false);
            }}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">シート名</span>
          <Input
            className="h-11"
            value={usersSheetNameValue}
            disabled={!unlocked}
            onChange={(event) => {
              setUsersSheetName(event.target.value);
              setSaved(false);
            }}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">ログインユーザー</h2>
        <ul className="space-y-2">
          {(users ?? []).map((user) => (
            <li key={user.clientId} className="flex gap-2">
              <Input
                className="h-11"
                value={user.name}
                disabled={!unlocked}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setUsers(
                    (users ?? []).map((item) =>
                      item.clientId === user.clientId
                        ? {
                            ...item,
                            name: nextName,
                            role:
                              nextName === ADMIN_USER_NAME || item.role === "admin"
                                ? "admin"
                                : "user",
                          }
                        : item,
                    ),
                  );
                  setSaved(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={!unlocked || (user.role === "admin" && (users ?? []).filter((item) => item.role === "admin").length < 2)}
                onClick={() => {
                  setUsers((users ?? []).filter((item) => item.clientId !== user.clientId));
                  setSaved(false);
                }}
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            className="h-11"
            value={newUserName}
            disabled={!unlocked}
            placeholder="新しいユーザー名"
            onChange={(event) => setNewUserName(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!unlocked || !newUserName.trim()}
            onClick={() => {
              const name = newUserName.trim();
              if (!name || (users ?? []).some((user) => user.name === name)) {
                return;
              }
              setUsers([
                ...(users ?? []),
                {
                  clientId: createClientId(),
                  name,
                  role: name === ADMIN_USER_NAME ? "admin" : "user",
                },
              ]);
              setNewUserName("");
              setSaved(false);
            }}
          >
            追加
          </Button>
        </div>
      </section>

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">保存しました。</p> : null}

      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={saving || !unlocked}
        onClick={() => void handleSave()}
      >
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
