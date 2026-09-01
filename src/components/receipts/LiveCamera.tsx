"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type LiveCameraProps = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

export function LiveCamera({ onCapture, onClose }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        setError("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      setError("写真の保存に失敗しました。");
      return;
    }

    onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        className="min-h-0 flex-1 bg-black object-contain"
        autoPlay
        playsInline
        muted
      />
      {error ? (
        <p className="px-4 py-3 text-sm text-white">{error}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 p-4 pb-8">
        <Button
          type="button"
          variant="secondary"
          className="h-14 text-base"
          onClick={onClose}
        >
          閉じる
        </Button>
        <Button
          type="button"
          className="h-14 text-base"
          disabled={Boolean(error)}
          onClick={() => void handleShutter()}
        >
          シャッター
        </Button>
      </div>
    </div>
  );
}
