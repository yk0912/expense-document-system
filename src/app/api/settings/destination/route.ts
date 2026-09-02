import { NextResponse } from "next/server";
import { z } from "zod";

import { parseSpreadsheetId } from "@/lib/settings/parse";
import { resolveAppSettings, saveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

const payloadSchema = z.object({
  spreadsheetId: z.string().trim().min(1),
  sheetName: z.string().trim().min(1),
});

export async function PUT(request: Request) {
  try {
    const body = payloadSchema.parse(await request.json());
    const current = await resolveAppSettings(request);
    const saved = await saveAppSettings({
      ...current,
      spreadsheetId: parseSpreadsheetId(body.spreadsheetId),
      sheetName: body.sheetName.trim(),
    });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "スプレッドシートIDとシート名を入力してください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "登録先の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
