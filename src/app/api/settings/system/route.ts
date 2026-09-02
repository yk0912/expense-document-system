import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminPassword } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/guard";
import { passwordsMatch } from "@/lib/auth/session";
import { parseDriveFolderId, parseSpreadsheetId } from "@/lib/settings/parse";
import { resolveAppSettings, saveAppSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const payloadSchema = z.object({
  password: z.string(),
  spreadsheetId: z.string().trim().optional(),
  spreadsheetUrl: z.string().trim().optional(),
  driveFolderId: z.string().trim().optional(),
  usersSpreadsheetId: z.string().trim().optional(),
  usersSheetName: z.string().trim().optional(),
  sheetName: z.string().trim().optional(),
});

export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }
  try {
    const body = payloadSchema.parse(await request.json());
    if (!passwordsMatch(body.password, await getAdminPassword())) {
      return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
    }
    const current = await resolveAppSettings(request);
    const spreadsheetSource = body.spreadsheetId || body.spreadsheetUrl || current.spreadsheetId;
    const saved = await saveAppSettings({
      ...current,
      spreadsheetId: parseSpreadsheetId(spreadsheetSource ?? ""),
      spreadsheetUrl: body.spreadsheetUrl?.trim() || current.spreadsheetUrl,
      driveFolderId: parseDriveFolderId(body.driveFolderId || current.driveFolderId),
      usersSpreadsheetId: parseSpreadsheetId(
        body.usersSpreadsheetId || current.usersSpreadsheetId || spreadsheetSource || "",
      ),
      usersSheetName: body.usersSheetName?.trim() || current.usersSheetName,
      sheetName: body.sheetName?.trim() || current.sheetName,
    });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "入力内容を確認してください。" }, { status: 400 });
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
