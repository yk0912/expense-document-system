import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/nav/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "レシまる",
  description: "レシートを撮影して経費を登録します",
  applicationName: "レシまる",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
