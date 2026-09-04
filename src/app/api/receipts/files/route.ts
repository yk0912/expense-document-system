import { NextResponse } from "next/server";

import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { downloadDriveFile } from "@/lib/google/drive";
import { isDriveFileId } from "@/lib/google/drive-file";
import { toGoogleErrorMessage } from "@/lib/google/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const fileId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!isDriveFileId(fileId)) {
    return NextResponse.json({ error: "画像が見つかりません。" }, { status: 404 });
  }

  const credentialIssue = await describeGoogleCredentialIssue();
  if (credentialIssue) {
    return NextResponse.json({ error: credentialIssue }, { status: 500 });
  }

  const auth = await createGoogleOAuthClient();
  if (!auth) {
    return NextResponse.json(
      { error: "Google認証情報が未設定です。" },
      { status: 500 },
    );
  }

  try {
    const file = await downloadDriveFile(auth, fileId);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: toGoogleErrorMessage(error, "画像の取得に失敗しました。"),
      },
      { status: 404 },
    );
  }
}
