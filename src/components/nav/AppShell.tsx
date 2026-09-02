"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { BottomNav } from "@/components/nav/BottomNav";
import { SettingsProvider } from "@/components/settings/SettingsProvider";

type SessionInfo = { name: string; isAdmin: boolean };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    if (isLogin) {
      return;
    }
    void fetch("/api/auth/me")
      .then(async (response) => (await response.json()) as SessionInfo | null)
      .then((payload) => setSession(payload));
  }, [isLogin, pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <SettingsProvider>
      <div className="flex min-h-full flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {session ? (
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-sm">
            <p className="truncate text-muted-foreground">{session.name}</p>
            <button type="button" className="text-primary" onClick={() => void handleLogout()}>
              ログアウト
            </button>
          </div>
        ) : null}
        {children}
      </div>
      <BottomNav />
    </SettingsProvider>
  );
}
