import Link from "next/link";
import { CalendarDays, Receipt } from "lucide-react";

const CHOICES = [
  {
    href: "/receipts/new",
    title: "レシートを読み取る",
    description: "経費レシートを撮影して、経費のスプレッドシートへ転記します。",
    icon: Receipt,
  },
  {
    href: "/attendance/new",
    title: "勤怠表を読み取る",
    description: "勤務実績報告書を撮影して、勤怠管理シートへ転記します。",
    icon: CalendarDays,
  },
] as const;

export function ModeSelectScreen() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">レシまる</p>
        <h1 className="text-2xl font-semibold tracking-tight">読み取る種類</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          レシートか勤怠表かを選んでください。
        </p>
      </header>
      <div className="grid gap-3">
        {CHOICES.map((choice) => {
          const Icon = choice.icon;
          return (
            <Link
              key={choice.href}
              href={choice.href}
              className="flex items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted"
            >
              <Icon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
              <span className="space-y-1">
                <span className="block text-base font-medium">{choice.title}</span>
                <span className="block text-sm leading-6 text-muted-foreground">
                  {choice.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
