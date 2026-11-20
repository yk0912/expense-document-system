import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { runWithAttendanceDestination } from "@/lib/attendance/open-destination";
import { loadAttendanceDirectory } from "@/lib/google/attendance-sheet";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import { resolveStoredAppSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
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
    const directory = await runWithAttendanceDestination(auth, settings, (spreadsheetId) =>
      loadAttendanceDirectory(auth, spreadsheetId, settings.attendanceSheetName),
    );
    return NextResponse.json(directory);
  } catch (error) {
    return NextResponse.json(
      {
        error: toGoogleErrorMessage(
          error,
          error instanceof Error ? error.message : "勤怠シートを読み取れませんでした。",
        ),
      },
      { status: 500 },
    );
  }
}
