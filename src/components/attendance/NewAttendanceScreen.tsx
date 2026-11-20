"use client";

import { useEffect, useState } from "react";

import { AttendanceReviewCard } from "@/components/attendance/AttendanceReviewCard";
import { useAttendanceDraft } from "@/components/attendance/AttendanceDraftProvider";
import { FixedErrorBanner } from "@/components/feedback/FixedErrorBanner";
import { ProgressBar } from "@/components/receipts/ProgressBar";
import { ReceiptCapture } from "@/components/receipts/ReceiptCapture";
import { ReceiptPreview } from "@/components/receipts/ReceiptPreview";
import { Button } from "@/components/ui/button";
import { isAttendanceReady, toWriteSheet } from "@/lib/attendance/model";
import { compressReceiptImage } from "@/lib/images/compress";
import { appFetch } from "@/lib/settings/client";
import type {
  AttendanceAnalyzeResponse,
  AttendanceDirectory,
  AttendanceRegisterResponse,
  ReviewAttendance,
} from "@/types/attendance";

function registerFingerprint(sheets: ReviewAttendance[]): string {
  return JSON.stringify(sheets.map(toWriteSheet));
}

export function NewAttendanceScreen() {
  const {
    image,
    analysis,
    results,
    error,
    isAnalyzing,
    isRegistering,
    progress,
    setAnalysis,
    setResults,
    setError,
    setIsAnalyzing,
    setIsRegistering,
    setProgress,
    replaceImage,
    analyzeAbortRef,
  } = useAttendanceDraft();
  const [isCompressing, setIsCompressing] = useState(false);
  const [openCameraOnCapture, setOpenCameraOnCapture] = useState(false);
  const [directory, setDirectory] = useState<AttendanceDirectory | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    fingerprint: string;
    overwriteDayCount: number;
    warnings: string[];
  } | null>(null);

  useEffect(() => {
    void appFetch("/api/attendance/directory")
      .then(async (response) => {
        const payload = (await response.json()) as AttendanceDirectory & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "勤怠シートを読み取れませんでした。");
        }
        setDirectory(payload);
        setDirectoryError(null);
      })
      .catch((loadError: unknown) => {
        setDirectory(null);
        setDirectoryError(
          loadError instanceof Error
            ? loadError.message
            : "勤怠シートを読み取れませんでした。",
        );
      });
  }, []);

  const analyzeImage = async (target: NonNullable<typeof image>) => {
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    setError(null);
    setConfirming(null);
    setIsAnalyzing(true);
    setProgress({ label: "画像を送信しています…", percent: 8 });
    const analyzeTimer = window.setInterval(() => {
      setProgress((current) => {
        if (!current || current.percent >= 90) {
          return current;
        }
        const next = Math.min(90, current.percent + 4);
        return {
          label: next < 35 ? "画像を送信しています…" : "勤務表を読み取っています…",
          percent: next,
        };
      });
    }, 400);
    try {
      const formData = new FormData();
      formData.append("image", new File([target.blob], "attendance.jpg", { type: target.mimeType }));
      const response = await appFetch("/api/attendance/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as AttendanceAnalyzeResponse & { error?: string };
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
      if (
        controller.signal.aborted ||
        (analyzeError instanceof DOMException && analyzeError.name === "AbortError")
      ) {
        return;
      }
      setError(analyzeError instanceof Error ? analyzeError.message : "読み取りに失敗しました。");
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
    setConfirming(null);
    setIsCompressing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    try {
      replaceImage(await compressReceiptImage(file, { maxEdge: 2200 }));
    } catch {
      setError("画像の処理に失敗しました。別の写真で試してください。");
    } finally {
      setIsCompressing(false);
    }
  };

  const updateSheet = (next: ReviewAttendance) => {
    if (!analysis) {
      return;
    }
    setConfirming(null);
    setAnalysis({
      ...analysis,
      sheets: analysis.sheets.map((sheet) =>
        sheet.clientId === next.clientId ? next : sheet,
      ),
    });
  };

  const postRegister = async (dryRun: boolean, confirmed: boolean) => {
    if (!analysis) {
      throw new Error("読み取り結果がありません。");
    }
    const response = await appFetch("/api/attendance/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dryRun,
        confirmed,
        sheets: analysis.sheets.map(toWriteSheet),
      }),
    });
    const payload = (await response.json()) as AttendanceRegisterResponse & { error?: string };
    if (!response.ok || !payload.results) {
      throw new Error(payload.error ?? "転記に失敗しました。");
    }
    return payload;
  };

  const handleRegister = async () => {
    if (!analysis || !analysis.sheets.every(isAttendanceReady)) {
      return;
    }
    const fingerprint = registerFingerprint(analysis.sheets);
    setError(null);
    setIsRegistering(true);
    setProgress({ label: "スプレッドシートを確認しています…", percent: 20 });
    try {
      if (!confirming || confirming.fingerprint !== fingerprint) {
        const preview = await postRegister(true, false);
        const failed = preview.results.filter((result) => !result.ok);
        if (preview.needsConfirm && preview.results.some((result) => result.ok)) {
          setConfirming({
            fingerprint,
            overwriteDayCount: preview.overwriteDayCount,
            warnings: [
              ...new Set(
                preview.results
                  .map((result) => result.headerWarning)
                  .filter((warning): warning is string => Boolean(warning)),
              ),
            ],
          });
          if (failed.length > 0) {
            setError(failed.map((result) => result.error ?? "転記できません。").join("\n"));
          }
          return;
        }
        if (!preview.results.some((result) => result.ok)) {
          setResults(preview.results);
          setError(
            failed.map((result) => result.error ?? "転記できません。").join("\n") ||
              "転記できる勤務表がありません。",
          );
          return;
        }
      }

      setProgress({ label: "スプレッドシートへ転記しています…", percent: 70 });
      const written = await postRegister(false, true);
      setResults(written.results);
      setConfirming(null);
      const failed = written.results.filter((result) => !result.ok);
      const failedIndexes = new Set(failed.map((result) => result.sheetIndex));
      if (failed.length > 0) {
        setAnalysis({
          ...analysis,
          sheets: analysis.sheets.filter((sheet) => failedIndexes.has(sheet.sheetIndex)),
        });
        setError(failed.map((result) => result.error ?? "転記できません。").join("\n"));
      } else {
        setProgress({ label: "転記が完了しました", percent: 100 });
      }
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "転記に失敗しました。");
    } finally {
      setIsRegistering(false);
      setProgress(null);
    }
  };

  const registeredAll =
    results !== null && results.length > 0 && results.every((result) => result.ok);
  const ready = analysis?.sheets.every(isAttendanceReady) ?? false;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">勤怠表</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {registeredAll ? "転記しました" : analysis ? "内容を確認" : image ? "読み取り確認" : "撮影する"}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {registeredAll
            ? "勤怠管理シートへ転記しました。"
            : analysis
              ? "氏名と各日の時間を確認してから転記してください。写真に複数枚写っていても、1人ずつ表示します。"
              : image
                ? "この写真から勤務表を読み取りますか？"
                : "勤務実績報告書を撮るか、ライブラリから選んでください。"}
        </p>
      </header>

      {directoryError ? (
        <p className="whitespace-pre-wrap rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {directoryError}
        </p>
      ) : directory ? (
        <p className="text-sm text-muted-foreground">
          転記先: {directory.sheetName}
          {directory.headerLabel ? `（見出し ${directory.headerLabel}）` : ""}
        </p>
      ) : null}

      {!analysis && !image ? (
        <>
          <ReceiptCapture
            disabled={isCompressing || isAnalyzing}
            openCamera={openCameraOnCapture}
            onFile={(file) => {
              setOpenCameraOnCapture(false);
              void handleFile(file);
            }}
          />
          {isCompressing ? (
            <p className="text-sm text-muted-foreground">画像を圧縮しています…</p>
          ) : null}
        </>
      ) : null}

      {image && !analysis ? (
        <>
          <ReceiptPreview image={image} alt="選択した勤務表" />
          {!isAnalyzing ? (
            <div className="space-y-3">
              <Button
                type="button"
                className="h-14 w-full text-base"
                onClick={() => void analyzeImage(image)}
              >
                読み取る
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 w-full text-base"
                onClick={() => {
                  setOpenCameraOnCapture(true);
                  replaceImage(null);
                }}
              >
                撮影し直す
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {results ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          {results.map((result) => (
            <div key={`${result.sheetIndex}-${result.employeeName}`} className="space-y-1 text-sm">
              <p className="font-medium">
                {result.employeeName || `勤務表 ${result.sheetIndex}`}
                {result.ok ? " を転記しました" : " は転記できません"}
              </p>
              {result.ok && result.rowNumber ? (
                <p>
                  {result.rowNumber}行目から、{result.writtenDays}日分
                  {result.clearedDays > 0 ? `、${result.clearedDays}日分を空欄` : ""}
                </p>
              ) : null}
              {result.error ? <p className="text-destructive">{result.error}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {analysis && !registeredAll ? (
        <div className="space-y-4">
          {analysis.sheets.map((sheet) => (
            <AttendanceReviewCard
              key={sheet.clientId}
              sheet={sheet}
              names={directory?.names ?? []}
              onChange={updateSheet}
              onRemove={
                analysis.sheets.length > 1
                  ? () => {
                      setConfirming(null);
                      setAnalysis({
                        ...analysis,
                        sheets: analysis.sheets
                          .filter((current) => current.clientId !== sheet.clientId)
                          .map((current, index) => ({ ...current, sheetIndex: index + 1 })),
                      });
                    }
                  : undefined
              }
            />
          ))}
          {confirming ? (
            <div className="space-y-2 rounded-lg border border-border p-4 text-sm leading-6">
              {confirming.overwriteDayCount > 0 ? (
                <p>{confirming.overwriteDayCount}日分はすでに数字があるため上書きします。</p>
              ) : null}
              {confirming.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <p>内容を確認して、もう一度転記ボタンを押してください。</p>
            </div>
          ) : null}
          <Button
            type="button"
            className="h-14 w-full text-base"
            disabled={isRegistering || !ready}
            onClick={() => void handleRegister()}
          >
            {isRegistering
              ? "転記中…"
              : confirming
                ? "この内容で転記"
                : ready
                  ? "スプレッドシートに転記"
                  : "氏名と年月を入力してください"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            disabled={isRegistering}
            onClick={() => {
              setConfirming(null);
              setAnalysis(null);
            }}
          >
            写真に戻る
          </Button>
        </div>
      ) : null}

      {registeredAll ? (
        <Button type="button" className="h-14 w-full text-base" onClick={() => replaceImage(null)}>
          続けて読み取る
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
      ) : error ? (
        <>
          <div className="h-28" />
          <FixedErrorBanner message={error} onDismiss={() => setError(null)} />
        </>
      ) : null}
    </div>
  );
}
