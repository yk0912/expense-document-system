import { NextResponse } from "next/server";
import { z } from "zod";

import { parseDriveFolderId } from "@/lib/settings/parse";
import {
  systemPasswordConfigured,
  verifySystemPassword,
} from "@/lib/settings/password";
import { resolveAppSettings, saveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

const payloadSchema = z.object({
  password: z.string(),
  driveFolderId: z.string().trim().min(1),
});

export async function PUT(request: Request) {
  try {
    const body = payloadSchema.parse(await request.json());
    if (systemPasswordConfigured() && !verifySystemPassword(body.password)) {
      return NextResponse.json(
        { error: "パスワードが違います。" },
        { status: 401 },
      );
    }
    const current = await resolveAppSettings(request);
    const saved = await saveAppSettings({
      ...current,
      driveFolderId: parseDriveFolderId(body.driveFolderId),
    });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "親フォルダIDを入力してください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "システム設定の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
