"use client";

import type { ReactNode } from "react";

import { BottomNav } from "@/components/nav/BottomNav";
import { SettingsProvider } from "@/components/settings/SettingsProvider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <div className="flex min-h-full flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav />
    </SettingsProvider>
  );
}
