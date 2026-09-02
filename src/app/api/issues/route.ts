import { NextResponse } from "next/server";
import { z } from "zod";

import { issueFieldLabel } from "@/lib/issues/fields";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import { ensureNamedFolder, uploadReceiptImage } from "@/lib/google/drive";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import { appendIssueRows, listIssueRows } from "@/lib/google/issue-sheet";
import { sanitizeFileToken, toCompactDate } from "@/lib/accounting/filename";
import { resolveAppSettings } from "@/lib/settings/server";
import { ISSUE_STATUS } from "@/types/issue";

export const maxDuration = 60;

const receiptSchema = z.object({
  receiptIndex: z.number().int().positive().optional(),
  assignedStore: z.string().trim(),
  transactionDate: z.string().nullable(),
  vendorName: z.string().trim(),
  failedFields: z.array(z.string().trim().min(1)).min(1),
  note: z.string().trim(),
});

const payloadSchema = z.object({
  receipts: z.array(receiptSchema).min(1),
});

function tokyoNow(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  const credentialIssue = describeGoogleCredentialIssue();
  if (credentialIssue) {
    return NextResponse.json({ error: credentialIssue, rows: [] }, { status: 500 });
  }

  const auth = createGoogleOAuthClient();
  const settings = await resolveAppSettings(request);
  if (!auth || !settings.spreadsheetId) {
    return NextResponse.json(
      { error: "登録先のスプレッドシートが未設定です。", rows: [] },
      { status: 400 },
    );
  }

  try {
    const rows = await listIssueRows(
      auth,
      settings.spreadsheetId,
      settings.issueSheetName,
    );
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      {
        error: toGoogleErrorMessage(error, "登録不良一覧の取得に失敗しました。"),
        rows: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const credentialIssue = describeGoogleCredentialIssue();
    if (credentialIssue) {
      return NextResponse.json({ error: credentialIssue }, { status: 500 });
    }

    const auth = createGoogleOAuthClient();
    const settings = await resolveAppSettings(request);
    if (!auth || !settings.spreadsheetId) {
      return NextResponse.json(
        { error: "登録先のスプレッドシートが未設定です。" },
        { status: 400 },
      );
    }
    if (!settings.driveFolderId) {
      return NextResponse.json(
        { error: "親フォルダIDが未設定です。システム設定で指定してください。" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") {
      return NextResponse.json({ error: "報告内容がありません。" }, { status: 400 });
    }
    const payload = payloadSchema.parse(JSON.parse(rawPayload));
    const file = formData.get("image");
    let uploaded: { name: string; webViewLink: string } | null = null;
    if (file instanceof File && file.size > 0) {
      const image = Buffer.from(await file.arrayBuffer());
      const first = payload.receipts[0];
      const dateToken = toCompactDate(first?.transactionDate || tokyoNow().slice(0, 10));
      const vendor = sanitizeFileToken(first?.vendorName || "receipt", 24);
      const folderId = await ensureNamedFolder(
        auth,
        settings.driveFolderId,
        "登録不良",
      );
      uploaded = await uploadReceiptImage(
        auth,
        folderId,
        `${dateToken}_${vendor}_不良_${crypto.randomUUID().slice(0, 8)}.jpg`,
        image,
      );
    }

    await appendIssueRows(
      auth,
      settings.spreadsheetId,
      payload.receipts.map((receipt) => ({
        reportedAt: tokyoNow(),
        assignedStore: receipt.assignedStore,
        transactionDate: receipt.transactionDate ?? "",
        vendorName: receipt.vendorName || "(不明)",
        failedFields: receipt.failedFields.map(issueFieldLabel).join("、"),
        note: receipt.note,
        fileName: uploaded?.name ?? "",
        fileUrl: uploaded?.webViewLink ?? "",
        status: ISSUE_STATUS.open,
      })),
      settings.issueSheetName,
    );

    const rows = await listIssueRows(
      auth,
      settings.spreadsheetId,
      settings.issueSheetName,
    );
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "不良項目を1つ以上選んでください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: toGoogleErrorMessage(error, "登録不良の報告に失敗しました。"),
      },
      { status: 500 },
    );
  }
}
