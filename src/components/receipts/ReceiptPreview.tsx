"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBytes, type CompressedReceiptImage } from "@/lib/images/compress";

type ReceiptPreviewProps = {
  image: CompressedReceiptImage;
};

export function ReceiptPreview({ image }: ReceiptPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>プレビュー</CardTitle>
        <CardDescription>
          元 {formatBytes(image.originalBytes)} → 送信予定{" "}
          {formatBytes(image.compressedBytes)}
          {image.width > 0 ? `（${image.width}×${image.height}）` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.previewUrl}
          alt="選択したレシート"
          className="mx-auto max-h-[55vh] w-full rounded-lg object-contain bg-muted"
        />
        {image.warning ? (
          <p className="text-sm text-destructive">{image.warning}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vercelの上限（4.5MB）に収まるよう圧縮しています。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
