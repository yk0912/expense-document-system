import { NextResponse } from "next/server";
import { z } from "zod";

import { attendanceRegisterPayloadSchema } from "@/lib/attendance/register-schema";
import { runWithAttendanceDestination } from "@/lib/attendance/open-destination";
import { requireSession } from "@/lib/auth/guard";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { registerAttendanceSheets } from "@/lib/google/attendance-sheet";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import { resolveStoredAppSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const credentialIssue = await describeGoogleCredentialIssue();
    if (credentialIssue) {
      return NextResponse.json({ error: credentialIssue }, { status: 500 });
    }
    const session = await requireSession(request);
    if (session instanceof NextResponse) {
      return session;
    }

    const settings = await resolveStoredAppSettings();
    if (!settings.attendanceSpreadsheetId || !settings.attendanceSheetName) {
      return NextResponse.json(
        { error: "勤怠の転記先が未設定です。設定でスプレッドシートIDとシート名を保存してください。" },
        { status: 400 },
      );
    }
    const auth = await createGoogleOAuthClient();
    if (!auth) {
      return NextResponse.json(
        { error: "Google認証情報が未設定です。" },
        { status: 500 },
      );
    }

    const body = attendanceRegisterPayloadSchema.parse(await request.json());
    const response = await runWithAttendanceDestination(auth, settings, (spreadsheetId) =>
      registerAttendanceSheets(
        auth,
        spreadsheetId,
        settings.attendanceSheetName,
        body.sheets,
        { dryRun: body.dryRun === true, confirmed: body.confirmed === true },
      ),
    );
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "転記内容を確認してください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: toGoogleErrorMessage(
          error,
          error instanceof Error ? error.message : "勤怠の転記に失敗しました。",
        ),
      },
      { status: 500 },
    );
  }
}
