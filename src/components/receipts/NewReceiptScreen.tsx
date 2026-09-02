"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ProgressBar } from "@/components/receipts/ProgressBar";
import { ReceiptCapture } from "@/components/receipts/ReceiptCapture";
import { ReceiptPreview } from "@/components/receipts/ReceiptPreview";
import { ReceiptReviewCard } from "@/components/receipts/ReceiptReviewCard";
import { Button } from "@/components/ui/button";
import { isReceiptReadyToRegister } from "@/lib/accounting/registration";
import {
  compressReceiptImage,
  type CompressedReceiptImage,
} from "@/lib/images/compress";
import { saveIssueDraft } from "@/lib/issues/draft";
import { receiptsHaveIssueFields } from "@/lib/issues/fields";
import { appFetch } from "@/lib/settings/client";
import type {
  AnalyzeResponse,
  RegisterReceiptResult,
  RegisterResponse,
  ReviewReceipt,
} from "@/types/receipt";

function canRegister(receipts: ReviewReceipt[]): boolean {
  return receipts.every(isReceiptReadyToRegister);
}

export function NewReceiptScreen() {
  const router = useRouter();
  const [image, setImage] = useState<CompressedReceiptImage | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [results, setResults] = useState<RegisterReceiptResult[] | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void appFetch("/api/receipts/categories").catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      analyzeAbortRef.current?.abort();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const replaceImage = (next: CompressedReceiptImage | null) => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (next) {
      previewUrlRef.current = next.previewUrl;
    }
    setImage(next);
    setAnalysis(null);
    setResults(null);
  };

  const analyzeImage = async (target: CompressedReceiptImage) => {
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    setError(null);
    setIsAnalyzing(true);
    setProgress({ label: "画像を送信しています…", percent: 8 });
    const analyzeTimer = window.setInterval(() => {
      setProgress((current) => {
        if (!current || current.percent >= 90) {
          return current;
        }
        const next = Math.min(90, current.percent + 4);
        return {
          label: next < 35 ? "画像を送信しています…" : "レシートを読み取っています…",
          percent: next,
        };
      });
    }, 400);
    try {
      const formData = new FormData();
      formData.append(
        "image",
        new File([target.blob], "receipt.jpg", { type: target.mimeType }),
      );
      const response = await appFetch("/api/receipts/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as AnalyzeResponse & {
        error?: string;
      };
      if (controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "読み取りに失敗しました。");
      }
      setProgress({ label: "読み取りが完了しました", percent: 100 });
      setAnalysis(payload);
      setResults(null);
    } catch (analyzeError) {
      if (controller.signal.aborted || (analyzeError instanceof DOMException && analyzeError.name === "AbortError")) {
        return;
      }
      setError(
        analyzeError instanceof Error
          ? analyzeError.message
          : "読み取りに失敗しました。",
      );
    } finally {
      window.clearInterval(analyzeTimer);
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null;
        setIsAnalyzing(false);
        setProgress(null);
      }
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setIsCompressing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    let next: CompressedReceiptImage | null = null;
    try {
      next = await compressReceiptImage(file);
      replaceImage(next);
    } catch {
      setError("画像の処理に失敗しました。別の写真で試してください。");
    } finally {
      setIsCompressing(false);
    }
    if (next) {
      await analyzeImage(next);
    }
  };

  const handleRegister = async () => {
    if (!image || !analysis || !canRegister(analysis.receipts)) {
      return;
    }

    setError(null);
    setIsRegistering(true);
    setProgress({ label: "スプレッドシートへ転記しています…", percent: 8 });
    const registerTimer = window.setInterval(() => {
      setProgress((current) => {
        if (!current || current.percent >= 90) {
          return current;
        }
        const nextPercent = Math.min(90, current.percent + 3);
        return {
          label:
            nextPercent < 45
              ? "スプレッドシートへ転記しています…"
              : "画像をDriveに保存しています…",
          percent: nextPercent,
        };
      });
    }, 400);
    try {
      const formData = new FormData();
      formData.append(
        "image",
        new File([image.blob], "receipt.jpg", { type: image.mimeType }),
      );
      formData.append(
        "payload",
        JSON.stringify({
          imageToken: analysis.imageToken,
          receipts: analysis.receipts.map((receipt) => ({
            receiptIndex: receipt.receiptIndex,
            assignedStore: receipt.assignedStore,
            transactionDate: receipt.transactionDate,
            vendorName: receipt.vendorName,
            vendorKind: receipt.vendorKind,
            totalAmount: receipt.totalAmount,
            lineTotal: receipt.lineTotal,
            priceBasis: receipt.priceBasis,
            items: receipt.items.map((item) => ({
              name: item.name,
              amount: item.amount,
              category: item.category,
            })),
          })),
        }),
      );
      const response = await appFetch("/api/receipts/register", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as RegisterResponse & {
        error?: string;
      };
      if (!response.ok && !payload.results) {
        throw new Error(payload.error ?? "登録に失敗しました。");
      }
      if (!payload.results) {
        throw new Error(payload.error ?? "登録に失敗しました。");
      }
      setProgress({ label: "登録が完了しました", percent: 100 });
      setResults(payload.results);
      if (payload.results.every((result) => !result.ok)) {
        setError(payload.results[0]?.error ?? payload.error ?? "登録に失敗しました。");
      }
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : "登録に失敗しました。",
      );
    } finally {
      window.clearInterval(registerTimer);
      setIsRegistering(false);
      setProgress(null);
    }
  };

  const handleReportIssues = async () => {
    if (!analysis) {
      return;
    }
    await saveIssueDraft({ image, analysis });
    router.push("/issues");
  };

  const registeredAll =
    results !== null && results.length > 0 && results.every((result) => result.ok);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">経費レシート</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {registeredAll ? "登録しました" : analysis ? "内容を確認" : "撮影する"}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {registeredAll
            ? "Driveに画像を保存し、スプレッドシートへ転記しました。"
            : analysis
              ? "間違っている箇所だけ直してください。飲食店は合計、スーパー等は商品ごとに区分してください。"
              : "撮影すると自動で読み取ります。1枚に複数枚写っていても構いません。"}
        </p>
      </header>

      {!analysis ? (
        <>
          <ReceiptCapture disabled={isCompressing || isAnalyzing} onFile={handleFile} />
          {isCompressing ? (
            <p className="text-sm text-muted-foreground">画像を圧縮しています…</p>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}

      {image && !analysis ? (
        <>
          <ReceiptPreview image={image} />
          <div className="space-y-3">
            {!isAnalyzing ? (
              <Button
                type="button"
                className="h-14 w-full text-base"
                onClick={() => void analyzeImage(image)}
              >
                もう一度読み取る
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              disabled={isAnalyzing}
              onClick={() => replaceImage(null)}
            >
              やり直す
            </Button>
          </div>
        </>
      ) : null}

      {results ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          {results.map((result) => (
            <div key={`${result.receiptIndex}-${result.fileName}`} className="space-y-1 text-sm">
              <p className="font-medium">
                レシート {result.receiptIndex}
                {result.vendorName ? `（${result.vendorName}）` : ""}
                {result.ok ? " を登録しました" : " は未完了です"}
              </p>
              {result.rowNumber ? (
                <p>
                  {result.sheetTitle || "登録シート"} {result.rowNumber}行目
                </p>
              ) : null}
              {result.fileName ? (
                result.fileUrl ? (
                  <p>
                    <a
                      href={result.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {result.fileName}
                    </a>
                  </p>
                ) : (
                  <p>{result.fileName}</p>
                )
              ) : null}
              {result.duplicates.length > 0 ? (
                <p className="text-destructive">
                  同じ日付・取引先・合計の行があります（
                  {result.duplicates.map((item) => `${item.rowNumber}行目`).join("、")}
                  ）。登録は完了しています。
                </p>
              ) : null}
              {result.error ? (
                <p className="whitespace-pre-wrap text-sm text-destructive">
                  {result.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {analysis && !registeredAll ? (
        <div className="space-y-4">
          {analysis.categoryMasterWarning ? (
            <p className="whitespace-pre-wrap text-sm text-destructive">
              {analysis.categoryMasterWarning}
            </p>
          ) : null}
          {analysis.receipts.map((receipt) => (
            <ReceiptReviewCard
              key={receipt.clientId}
              receipt={receipt}
              categories={analysis.categories}
              onChange={(next) =>
                setAnalysis({
                  ...analysis,
                  receipts: analysis.receipts.map((current) =>
                    current.clientId === next.clientId ? next : current,
                  ),
                })
              }
            />
          ))}
          <Button
            type="button"
            className="h-14 w-full text-base"
            disabled={isRegistering || !canRegister(analysis.receipts)}
            onClick={() => void handleRegister()}
          >
            {isRegistering
              ? "登録中…"
              : canRegister(analysis.receipts)
                ? "登録"
                : "未入力があるため登録できません"}
          </Button>
          {receiptsHaveIssueFields(analysis.receipts) ? (
            <Button
              type="button"
              variant="outline"
              className="h-14 w-full text-base"
              disabled={isRegistering}
              onClick={() => void handleReportIssues()}
            >
              登録不良を報告
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            disabled={isRegistering}
            onClick={() => setAnalysis(null)}
          >
            写真に戻る
          </Button>
        </div>
      ) : null}

      {registeredAll ? (
        <Button type="button" className="h-14 w-full text-base" onClick={() => replaceImage(null)}>
          続けて登録
        </Button>
      ) : null}

      {progress ? (
        <>
          <div className="h-24" />
          <div className="fixed inset-x-0 z-50 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm bottom-[calc(4rem+env(safe-area-inset-bottom))] pb-3">
            <div className="mx-auto w-full max-w-md">
              <ProgressBar label={progress.label} percent={progress.percent} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
