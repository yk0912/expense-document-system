import { NextResponse } from "next/server";
import { z } from "zod";

import { sumAmountsByCategory } from "@/lib/accounting/category-mapper";
import {
  buildSharedReceiptFileName,
  yearMonthFromDate,
} from "@/lib/accounting/filename";
import { resolveReceiptTotal } from "@/lib/accounting/registration";
import { registerPayloadSchema } from "@/lib/ai/register-schema";
import { createGoogleOAuthClient, describeGoogleCredentialIssue } from "@/lib/google/auth";
import {
  deleteDriveFile,
  ensureYearMonthFolder,
  uploadReceiptImage,
  type UploadedDriveFile,
} from "@/lib/google/drive";
import { toGoogleErrorMessage } from "@/lib/google/errors";
import {
  appendReceiptRows,
  clearReceiptRows,
  updateReceiptFileLinks,
  type ReceiptSheetWrite,
  type SheetLayout,
} from "@/lib/google/sheets";
import {
  consumeReceiptImage,
  getReceiptImage,
} from "@/lib/images/receipt-image-store";
import type { RegisterReceiptResult, RegisterResponse } from "@/types/receipt";

export const maxDuration = 60;

type PreparedReceipt = {
  receiptIndex: number;
  vendorName: string;
  fileName: string;
  write: ReceiptSheetWrite;
};

export async function POST(request: Request) {
  try {
    const credentialIssue = describeGoogleCredentialIssue();
    if (credentialIssue) {
      return NextResponse.json({ error: credentialIssue }, { status: 500 });
    }

    const auth = createGoogleOAuthClient();
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
    const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() ?? "経費集計";

    if (!auth || !spreadsheetId) {
      return NextResponse.json(
        { error: "Google認証またはスプレッドシートIDが未設定です。" },
        { status: 500 },
      );
    }
    if (!driveFolderId) {
      return NextResponse.json(
        { error: "GOOGLE_DRIVE_FOLDER_ID が未設定です。" },
        { status: 500 },
      );
    }

    const { payload, image } = await readRegisterImage(request);
    if (!image) {
      return NextResponse.json(
        {
          error:
            "読み取り時の画像が見つかりません。もう一度撮影して読み取ってから登録してください。",
        },
        { status: 409 },
      );
    }

    const fileName = buildSharedReceiptFileName({
      receipts: payload.receipts.map((receipt) => ({
        transactionDate: receipt.transactionDate,
        vendorName: receipt.vendorName,
        amount: resolveReceiptTotal(receipt),
      })),
      shortId: crypto.randomUUID().slice(0, 8),
    });

    const prepared: PreparedReceipt[] = payload.receipts.map((receipt, index) => {
      const totalAmount = resolveReceiptTotal(receipt);
      return {
        receiptIndex: index + 1,
        vendorName: receipt.vendorName,
        fileName,
        write: {
          assignedStore: receipt.assignedStore,
          transactionDate: receipt.transactionDate,
          vendorName: receipt.vendorName,
          priceBasis: receipt.priceBasis,
          categoryAmounts: sumAmountsByCategory(receipt.items),
          totalAmount,
          fileName,
          fileUrl: "",
        } satisfies ReceiptSheetWrite,
      };
    });

    const firstDate = prepared[0]?.write.transactionDate;
    if (!firstDate) {
      return NextResponse.json(
        { error: "登録内容が不正です。確認画面の必須項目を見直してください。" },
        { status: 400 },
      );
    }

    let layout: SheetLayout;
    let writtenRows: Array<{
      rowNumber: number;
      duplicates: RegisterReceiptResult["duplicates"];
    }>;
    let folderId: string;
    try {
      const { year, month } = yearMonthFromDate(firstDate);
      const [sheetResult, folderResult] = await Promise.allSettled([
        appendReceiptRows(
          auth,
          spreadsheetId,
          sheetName,
          prepared.map((item) => item.write),
        ),
        ensureYearMonthFolder(auth, driveFolderId, year, month),
      ]);

      if (sheetResult.status === "rejected") {
        throw sheetResult.reason;
      }

      layout = sheetResult.value.layout;
      writtenRows = sheetResult.value.written;

      if (folderResult.status === "rejected") {
        await clearReceiptRows(
          auth,
          spreadsheetId,
          layout,
          writtenRows.map((row) => row.rowNumber),
        );
        throw folderResult.reason;
      }

      folderId = folderResult.value;
    } catch (error) {
      const message = toGoogleErrorMessage(
        error,
        error instanceof Error ? error.message : "スプレッドシートへの転記に失敗しました。",
      );
      return NextResponse.json(
        {
          results: prepared.map((item) => ({
            receiptIndex: item.receiptIndex,
            vendorName: item.vendorName,
            ok: false,
            rowNumber: null,
            fileName: null,
            fileUrl: null,
            duplicates: [],
            error: message,
          })),
        } satisfies RegisterResponse,
        { status: 500 },
      );
    }

    let uploaded: UploadedDriveFile;
    try {
      uploaded = await uploadReceiptImage(auth, folderId, fileName, image);
    } catch (error) {
      await clearReceiptRows(
        auth,
        spreadsheetId,
        layout,
        writtenRows.map((row) => row.rowNumber),
      );
      const message = toGoogleErrorMessage(
        error,
        "画像の保存に失敗したため、登録を取り消しました。",
      );
      return NextResponse.json(
        {
          results: prepared.map((item) => ({
            receiptIndex: item.receiptIndex,
            vendorName: item.vendorName,
            ok: false,
            rowNumber: null,
            fileName: null,
            fileUrl: null,
            duplicates: [],
            error: message,
          })),
        } satisfies RegisterResponse,
        { status: 500 },
      );
    }

    try {
      await updateReceiptFileLinks(
        auth,
        spreadsheetId,
        layout,
        writtenRows.map((row) => ({
          rowNumber: row.rowNumber,
          fileName: uploaded.name,
          fileUrl: uploaded.webViewLink,
        })),
      );
    } catch (linkError) {
      await deleteDriveFile(auth, uploaded.id);
      await clearReceiptRows(
        auth,
        spreadsheetId,
        layout,
        writtenRows.map((row) => row.rowNumber),
      );
      const message = toGoogleErrorMessage(
        linkError,
        "画像の保存に失敗したため、登録を取り消しました。",
      );
      return NextResponse.json(
        {
          results: prepared.map((item) => ({
            receiptIndex: item.receiptIndex,
            vendorName: item.vendorName,
            ok: false,
            rowNumber: null,
            fileName: null,
            fileUrl: null,
            duplicates: [],
            error: message,
          })),
        } satisfies RegisterResponse,
        { status: 500 },
      );
    }

    if (payload.imageToken) {
      consumeReceiptImage(payload.imageToken);
    }

    const results: RegisterReceiptResult[] = prepared.map((item, index) => ({
      receiptIndex: item.receiptIndex,
      vendorName: item.vendorName,
      ok: true,
      rowNumber: writtenRows[index]?.rowNumber ?? null,
      fileName: uploaded.name,
      fileUrl: uploaded.webViewLink,
      duplicates: writtenRows[index]?.duplicates ?? [],
      error: null,
    }));

    return NextResponse.json({ results } satisfies RegisterResponse);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "登録内容が不正です。確認画面の必須項目を見直してください。" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: toGoogleErrorMessage(
          error,
          error instanceof Error ? error.message : "登録に失敗しました。",
        ),
      },
      { status: 500 },
    );
  }
}

async function readRegisterImage(request: Request): Promise<{
  payload: z.infer<typeof registerPayloadSchema>;
  image: Buffer | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") {
      throw new SyntaxError("payload missing");
    }
    const payload = registerPayloadSchema.parse(JSON.parse(rawPayload));
    const cached = payload.imageToken
      ? getReceiptImage(payload.imageToken)
      : null;
    if (cached) {
      return { payload, image: cached.image };
    }
    const file = formData.get("image");
    if (file instanceof File && file.size > 0) {
      return { payload, image: Buffer.from(await file.arrayBuffer()) };
    }
    return { payload, image: null };
  }

  const payload = registerPayloadSchema.parse(await request.json());
  const cached = payload.imageToken
    ? getReceiptImage(payload.imageToken)
    : null;
  return { payload, image: cached?.image ?? null };
}
