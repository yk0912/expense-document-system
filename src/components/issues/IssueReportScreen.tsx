"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ReceiptCapture } from "@/components/receipts/ReceiptCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ISSUE_FIELDS,
  issueFieldLabel,
} from "@/lib/issues/fields";
import {
  clearIssueDraft,
  dataUrlToFile,
  readIssueDraft,
  type IssueDraftReceipt,
} from "@/lib/issues/draft";
import { appFetch } from "@/lib/settings/client";
import { STORES } from "@/types/receipt";
import { ISSUE_STATUS, type IssueSheetRow } from "@/types/issue";
import { cn } from "@/lib/utils";

type ReceiptForm = IssueDraftReceipt;

function emptyReceipt(): ReceiptForm {
  return {
    receiptIndex: 1,
    assignedStore: "",
    transactionDate: "",
    vendorName: "",
    failedFields: [],
    note: "",
  };
}

function isDone(status: string): boolean {
  return status.replace(/\s+/g, "").includes("改修完了");
}

function subscribeIssueDraft() {
  return () => undefined;
}

function receiptsFromDraft(draft: ReturnType<typeof readIssueDraft>): ReceiptForm[] {
  if (!draft?.receipts.length) {
    return [emptyReceipt()];
  }
  return draft.receipts.map((receipt) => ({
    ...receipt,
    transactionDate: receipt.transactionDate ?? "",
  }));
}

export function IssueReportScreen() {
  const draft = useSyncExternalStore(subscribeIssueDraft, readIssueDraft, () => null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [receiptsOverride, setReceiptsOverride] = useState<ReceiptForm[] | null>(null);
  const [rows, setRows] = useState<IssueSheetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const activeDraft = draftDismissed ? null : draft;
  const receipts = receiptsOverride ?? receiptsFromDraft(activeDraft);
  const imageDataUrl = activeDraft?.imageDataUrl ?? null;
  const preview = imagePreview ?? imageDataUrl;
  const draftFile = useMemo(
    () => (imageDataUrl ? dataUrlToFile(imageDataUrl) : null),
    [imageDataUrl],
  );
  const file = imageFile ?? draftFile;

  useEffect(() => {
    let cancelled = false;
    void appFetch("/api/issues")
      .then(async (response) => {
        const payload = (await response.json()) as {
          rows?: IssueSheetRow[];
          error?: string;
        };
        if (cancelled) {
          return;
        }
        setRows(payload.rows ?? []);
        if (!response.ok && payload.error) {
          setError(payload.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("一覧の取得に失敗しました。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(
    () => receipts.some((receipt) => receipt.failedFields.length > 0),
    [receipts],
  );

  const updateReceipt = (index: number, patch: Partial<ReceiptForm>) => {
    setReceiptsOverride(
      receipts.map((receipt, currentIndex) =>
        currentIndex === index ? { ...receipt, ...patch } : receipt,
      ),
    );
    setSaved(false);
  };

  const toggleField = (index: number, key: string) => {
    const receipt = receipts[index];
    if (!receipt) {
      return;
    }
    const next = receipt.failedFields.includes(key)
      ? receipt.failedFields.filter((item) => item !== key)
      : [...receipt.failedFields, key];
    updateReceipt(index, { failedFields: next });
  };

  const handleSubmit = async () => {
    const ready = receipts.filter((receipt) => receipt.failedFields.length > 0);
    if (ready.length === 0) {
      setError("不良項目を1つ以上選んでください。");
      return;
    }
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append("image", file);
      }
      formData.append(
        "payload",
        JSON.stringify({
          receipts: ready.map((receipt) => ({
            ...receipt,
            transactionDate: receipt.transactionDate || null,
          })),
        }),
      );
      const response = await appFetch("/api/issues", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        rows?: IssueSheetRow[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "報告に失敗しました。");
      }
      setRows(payload.rows ?? []);
      setSaved(true);
      clearIssueDraft();
      setDraftDismissed(true);
      setReceiptsOverride([emptyReceipt()]);
      setImageFile(null);
      setImagePreview(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "報告に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">報告</p>
        <h1 className="text-2xl font-semibold tracking-tight">登録不良報告</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          読み取れなかった項目を選んで送ると、写真と内容が書き込み先ブックの「登録不良」シートに残ります。開発者がステータスを改修完了にすると、下の一覧で確認できます。
        </p>
      </header>

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="報告するレシート"
          className="max-h-56 w-full rounded-lg object-contain bg-muted"
        />
      ) : (
        <ReceiptCapture
          onFile={(file) => {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
            setDraftDismissed(true);
          }}
        />
      )}

      {receipts.map((receipt, index) => {
        const unusedFields = ISSUE_FIELDS.filter(
          (field) => !receipt.failedFields.includes(field.key),
        );
        return (
          <section key={`${receipt.receiptIndex}-${index}`} className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">レシート {receipt.receiptIndex}</p>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">取引先</span>
              <Input
                className="h-11"
                value={receipt.vendorName}
                onChange={(event) =>
                  updateReceipt(index, { vendorName: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">購入日</span>
              <input
                type="date"
                className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                value={receipt.transactionDate ?? ""}
                onChange={(event) =>
                  updateReceipt(index, { transactionDate: event.target.value })
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">店舗</span>
              <select
                className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                value={receipt.assignedStore}
                onChange={(event) =>
                  updateReceipt(index, { assignedStore: event.target.value })
                }
              >
                <option value="">未選択</option>
                {STORES.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">登録不良だった項目</p>
              <div className="flex flex-wrap gap-2">
                {receipt.failedFields.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                    onClick={() => toggleField(index, key)}
                  >
                    {issueFieldLabel(key)} ×
                  </button>
                ))}
              </div>
              {unusedFields.length > 0 ? (
                <select
                  className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      toggleField(index, event.target.value);
                    }
                  }}
                >
                  <option value="">項目を追加</option>
                  {unusedFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">詳細（任意）</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-base"
                value={receipt.note}
                onChange={(event) => updateReceipt(index, { note: event.target.value })}
              />
            </label>
          </section>
        );
      })}

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">報告しました。</p> : null}

      <Button
        type="button"
        className="h-14 w-full text-base"
        disabled={submitting || !canSubmit}
        onClick={() => void handleSubmit()}
      >
        {submitting ? "送信中…" : "報告する"}
      </Button>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">登録不良シート</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ報告はありません。</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-[640px] w-full text-left text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">日時</th>
                  <th className="px-2 py-2 font-medium">店舗</th>
                  <th className="px-2 py-2 font-medium">取引先</th>
                  <th className="px-2 py-2 font-medium">不良項目</th>
                  <th className="px-2 py-2 font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .reverse()
                  .map((row) => (
                    <tr key={row.rowNumber} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5",
                            isDone(row.status)
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800",
                          )}
                        >
                          {row.status || ISSUE_STATUS.open}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.reportedAt}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.assignedStore}</td>
                      <td className="px-2 py-2">
                        {row.fileUrl ? (
                          <a href={row.fileUrl} target="_blank" rel="noreferrer" className="underline">
                            {row.vendorName || "画像"}
                          </a>
                        ) : (
                          row.vendorName
                        )}
                      </td>
                      <td className="px-2 py-2">{row.failedFields}</td>
                      <td className="px-2 py-2">{row.note}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
