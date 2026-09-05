"use client";

import { Button } from "@/components/ui/button";

type FixedErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

export function FixedErrorBanner({ message, onDismiss }: FixedErrorBannerProps) {
  return (
    <div className="fixed inset-x-0 z-50 px-4 pb-3 bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto flex w-full max-w-md max-h-[min(40vh,16rem)] flex-col overflow-hidden rounded-xl bg-destructive text-sm text-white shadow-[0_-8px_24px_rgba(0,0,0,0.16)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
          <p className="font-medium">エラー</p>
          <Button
            type="button"
            variant="ghost"
            className="h-10 shrink-0 px-3 text-white hover:bg-white/15 hover:text-white"
            onClick={onDismiss}
          >
            閉じる
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          <p className="whitespace-pre-wrap leading-6">{message}</p>
        </div>
      </div>
    </div>
  );
}
