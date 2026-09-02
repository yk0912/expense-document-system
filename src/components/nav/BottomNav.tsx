"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, FileSpreadsheet, Settings, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/receipts/new",
    label: "読み込む",
    icon: Camera,
    match: (path: string) => path === "/" || path.startsWith("/receipts"),
  },
  {
    href: "/destination",
    label: "登録先",
    icon: FileSpreadsheet,
    match: (path: string) => path.startsWith("/destination"),
  },
  {
    href: "/issues",
    label: "不良報告",
    icon: TriangleAlert,
    match: (path: string) => path.startsWith("/issues"),
  },
  {
    href: "/system",
    label: "設定",
    icon: Settings,
    match: (path: string) => path.startsWith("/system"),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      aria-label="メインメニュー"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] leading-none",
                  active ? "text-primary font-semibold" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
