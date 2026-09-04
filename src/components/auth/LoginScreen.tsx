"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { DeployedAtLabel } from "@/components/nav/DeployedAtLabel";
import { Button } from "@/components/ui/button";
import { ADMIN_USER_NAME } from "@/lib/auth/constants";

type LoginUser = { name: string; role: "admin" | "user" };

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<LoginUser[] | null>(null);
  const [name, setName] = useState(ADMIN_USER_NAME);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/users")
      .then(async (response) => {
        const payload = (await response.json()) as {
          users?: LoginUser[];
          error?: string;
        };
        const next = payload.users?.length
          ? payload.users
          : [{ name: ADMIN_USER_NAME, role: "admin" as const }];
        setUsers(next);
        setName(next[0]?.name ?? ADMIN_USER_NAME);
      })
      .catch(() => {
        setUsers([{ name: ADMIN_USER_NAME, role: "admin" }]);
      });
  }, []);

  const selected = users?.find((user) => user.name === name);
  const needsPassword = selected?.role === "admin" || name === ADMIN_USER_NAME;

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          password: needsPassword ? password : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "ログインに失敗しました。");
      }
      router.replace(searchParams.get("next") || "/receipts/new");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <Image
          src="/reshimaru-logo.png"
          alt="レシまる"
          width={1024}
          height={341}
          preload
          className="mx-auto h-auto w-[min(100%,280px)]"
        />
      </header>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">ユーザー</span>
        <select
          className="h-14 w-full rounded-lg border border-input bg-background px-2.5 text-base"
          value={name}
          onChange={(event) => setName(event.target.value)}
        >
          {(users ?? [{ name: ADMIN_USER_NAME, role: "admin" as const }]).map((user) => (
            <option key={user.name} value={user.name}>
              {user.name}
            </option>
          ))}
        </select>
      </label>

      {needsPassword ? (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">パスワード</span>
          <input
            className="h-14 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
      ) : null}

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}

      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={loading || !name}
        onClick={() => void handleLogin()}
      >
        {loading ? "ログイン中…" : "ログイン"}
      </Button>

      <DeployedAtLabel className="text-center text-xs text-muted-foreground" />
    </div>
  );
}
