import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/guard";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { listSpreadsheetSheetTitles } from "@/lib/google/attendance-sheet";
import { parseSpreadsheetId } from "@/lib/settings/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const credentialIssue = describeGoogleCredentialIssue();
    if (credentialIssue) {
      return NextResponse.json({ error: credentialIssue }, { status: 500 });
    }
    const session = await requireSession(request);
    if (session instanceof NextResponse) {
      return session;
    }
    const spreadsheetId = parseSpreadsheetId(
      new URL(request.url).searchParams.get("spreadsheetId") ?? "",
    );
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "スプレッドシートIDを入力してください。" },
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
    const listed = await listSpreadsheetSheetTitles(auth, spreadsheetId);
    if (listed.titles.length === 0) {
      return NextResponse.json(
        { error: "シートが見つかりません。" },
        { status: 404 },
      );
    }
    return NextResponse.json(listed);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "シート一覧を読み取れませんでした。",
      },
      { status: 500 },
    );
  }
}
