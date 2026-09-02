import { NextResponse } from "next/server";
import { z } from "zod";

import { toAnalyzeResponse } from "@/lib/accounting/analysis-mapper";
import { fetchCategoryMaster } from "@/lib/accounting/category-master";
import { GeminiReceiptAnalyzer } from "@/lib/ai/gemini-receipt-analyzer";
import { storeReceiptImage } from "@/lib/images/receipt-image-store";
import { FORMAT_SHEET_NAME } from "@/lib/settings/types";
import { resolveAppSettings } from "@/lib/settings/server";

export const maxDuration = 60;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "画像ファイルを送信してください。" },
        { status: 400 },
      );
    }

    if (file.size > 4.5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "画像が大きすぎます。撮り直すか、ライブラリから小さい写真を選んでください。" },
        { status: 413 },
      );
    }

    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "JPEG / PNG / WebP / HEIC の画像を送ってください。" },
        { status: 400 },
      );
    }

    const settings = await resolveAppSettings(request);
    const { categories, warning } = await fetchCategoryMaster({
      spreadsheetId: settings.spreadsheetId,
      summarySheetName: FORMAT_SHEET_NAME,
      categorySheetName: settings.categorySheetName,
    });
    const image = Buffer.from(await file.arrayBuffer());
    const analyzer = new GeminiReceiptAnalyzer();
    const analysis = await analyzer.analyze(image, mimeType, categories);
    const imageToken = storeReceiptImage(image, mimeType);

    return NextResponse.json(
      toAnalyzeResponse(analysis, categories, warning, imageToken),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "解析結果の形式が不正でした。もう一度読み取ってください。" },
        { status: 502 },
      );
    }

    const message = toUserErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function toUserErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "解析に失敗しました。";
  if (raw.includes("did not match the expected pattern")) {
    return "読み取り結果の形式が不正でした。もう一度撮影してください。";
  }
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string };
        message?: string;
      };
      if (parsed.error?.message) {
        return parsed.error.message;
      }
      if (parsed.message) {
        return parsed.message;
      }
    } catch {
      // keep raw
    }
  }
  return raw;
}
