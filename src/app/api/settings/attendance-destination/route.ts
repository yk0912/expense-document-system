import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { ensureGoogleSpreadsheet } from "@/lib/google/attendance-sheet";
import { parseSpreadsheetId, spreadsheetUrlFromId } from "@/lib/settings/parse";
import { resolveAppSettings, saveAppSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const payloadSchema = z.object({
  spreadsheetId: z.string().trim().min(1),
  sheetName: z.string().trim().min(1),
});

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) {
    return session;
  }
  try {
    const body = payloadSchema.parse(await request.json());
    const credentialIssue = describeGoogleCredentialIssue();
    if (credentialIssue) {
      return NextResponse.json({ error: credentialIssue }, { status: 500 });
    }
    const current = await resolveAppSettings(request);
    const fileId = parseSpreadsheetId(body.spreadsheetId);
    if (!fileId) {
      return NextResponse.json(
        { error: "スプレッドシートIDを確認してください。" },
        { status: 400 },
      );
    }
    const auth = createGoogleOAuthClient();
    if (!auth) {
      return NextResponse.json(
        { error: "Google認証情報が未設定です。" },
        { status: 500 },
      );
    }
    const converted = await ensureGoogleSpreadsheet(auth, fileId);
    const saved = await saveAppSettings({
      ...current,
      attendanceSpreadsheetId: converted.spreadsheetId,
      attendanceSpreadsheetUrl: spreadsheetUrlFromId(converted.spreadsheetId),
      attendanceSheetName: body.sheetName.trim(),
    });
    return NextResponse.json({ ...saved, converted: converted.converted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "スプレッドシートIDとシート名を入力してください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "勤怠の転記先を保存できませんでした。",
      },
      { status: 500 },
    );
  }
}
