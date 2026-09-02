import { detectIssueFields } from "@/lib/issues/fields";
import type { CompressedReceiptImage } from "@/lib/images/compress";
import type { AnalyzeResponse } from "@/types/receipt";

const STORAGE_KEY = "expense-issue-draft";

export type IssueDraftReceipt = {
  receiptIndex: number;
  assignedStore: string;
  transactionDate: string | null;
  vendorName: string;
  failedFields: string[];
  note: string;
};

export type IssueDraft = {
  imageDataUrl: string | null;
  receipts: IssueDraftReceipt[];
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("画像の変換に失敗しました。"));
    };
    reader.onerror = () => reject(new Error("画像の変換に失敗しました。"));
    reader.readAsDataURL(blob);
  });
}

export async function saveIssueDraft(input: {
  image: CompressedReceiptImage | null;
  analysis: AnalyzeResponse;
}): Promise<void> {
  const draft: IssueDraft = {
    imageDataUrl: input.image ? await blobToDataUrl(input.image.blob) : null,
    receipts: input.analysis.receipts.map((receipt) => ({
      receiptIndex: receipt.receiptIndex,
      assignedStore: receipt.assignedStore,
      transactionDate: receipt.transactionDate,
      vendorName: receipt.vendorName,
      failedFields: detectIssueFields(receipt),
      note: receipt.warnings.join("\n"),
    })),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  cachedRaw = null;
}

let cachedRaw: string | null = null;
let cachedDraft: IssueDraft | null = null;

export function readIssueDraft(): IssueDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) {
    return cachedDraft;
  }
  cachedRaw = raw;
  if (!raw) {
    cachedDraft = null;
    return null;
  }
  try {
    cachedDraft = JSON.parse(raw) as IssueDraft;
    return cachedDraft;
  } catch {
    cachedDraft = null;
    return null;
  }
}

export function clearIssueDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
  cachedRaw = null;
  cachedDraft = null;
}

export function dataUrlToFile(dataUrl: string, fileName = "receipt.jpg"): File {
  const [header, body] = dataUrl.split(",");
  const mime = header?.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  const binary = atob(body ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mime });
}
