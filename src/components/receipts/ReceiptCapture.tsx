"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { LiveCamera } from "@/components/receipts/LiveCamera";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function canUseLiveCamera(): boolean {
  return window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

type ReceiptCaptureProps = {
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function ReceiptCapture({ disabled, onFile }: ReceiptCaptureProps) {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const lastFileKeyRef = useRef("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const takeFile = (file: File) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (lastFileKeyRef.current === key) {
      return;
    }
    lastFileKeyRef.current = key;
    setHint(null);
    onFile(file);
  };

  const handleLibraryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      takeFile(file);
    }
    event.target.value = "";
  };

  useEffect(() => {
    const input = libraryInputRef.current;
    if (!input) {
      return;
    }

    const recover = () => {
      const file = input.files?.[0];
      if (file) {
        takeFile(file);
      }
    };

    window.addEventListener("pageshow", recover);
    window.addEventListener("focus", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener("pageshow", recover);
      window.removeEventListener("focus", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, []);

  const handleCameraClick = () => {
    if (canUseLiveCamera()) {
      setHint(null);
      setLiveOpen(true);
      return;
    }

    if (isIOS()) {
      setHint(
        "iPhoneのカメラアプリに切り替えると、写真を使用してもSafariに戻りません。今は「ライブラリから選ぶ」で、さっき撮った写真を選んでください。HTTPSで開くと、この画面のまま撮影できます。",
      );
      return;
    }

    libraryInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          className="h-14 w-full text-base"
          disabled={disabled}
          onClick={handleCameraClick}
        >
          カメラで撮影
        </Button>
        <label
          className={cn(
            buttonVariants({
              variant: "outline",
              className: "relative h-14 w-full text-base",
            }),
            "cursor-pointer overflow-hidden",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            disabled={disabled}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            onChange={handleLibraryChange}
          />
          <span className="pointer-events-none">ライブラリから選ぶ</span>
        </label>
      </div>
      {hint ? <p className="text-sm leading-6 text-destructive">{hint}</p> : null}
      {liveOpen ? (
        <LiveCamera
          onCapture={(file) => {
            setLiveOpen(false);
            takeFile(file);
          }}
          onClose={() => setLiveOpen(false)}
        />
      ) : null}
    </div>
  );
}
