"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { CompressedReceiptImage } from "@/lib/images/compress";
import type {
  AttendanceAnalyzeResponse,
  AttendanceRegisterResult,
} from "@/types/attendance";

type AttendanceDraftContextValue = {
  image: CompressedReceiptImage | null;
  analysis: AttendanceAnalyzeResponse | null;
  results: AttendanceRegisterResult[] | null;
  error: string | null;
  isAnalyzing: boolean;
  isRegistering: boolean;
  progress: { label: string; percent: number } | null;
  setAnalysis: Dispatch<SetStateAction<AttendanceAnalyzeResponse | null>>;
  setResults: Dispatch<SetStateAction<AttendanceRegisterResult[] | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsAnalyzing: Dispatch<SetStateAction<boolean>>;
  setIsRegistering: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<{ label: string; percent: number } | null>>;
  replaceImage: (next: CompressedReceiptImage | null) => void;
  clearDraft: () => void;
  analyzeAbortRef: MutableRefObject<AbortController | null>;
};

const AttendanceDraftContext = createContext<AttendanceDraftContextValue | null>(null);

function revokePreview(image: CompressedReceiptImage | null) {
  if (image?.previewUrl) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export function AttendanceDraftProvider({ children }: { children: ReactNode }) {
  const [image, setImageState] = useState<CompressedReceiptImage | null>(null);
  const [analysis, setAnalysis] = useState<AttendanceAnalyzeResponse | null>(null);
  const [results, setResults] = useState<AttendanceRegisterResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const imageRef = useRef<CompressedReceiptImage | null>(null);

  const replaceImage = useCallback((next: CompressedReceiptImage | null) => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    revokePreview(imageRef.current);
    imageRef.current = next;
    setImageState(next);
    setAnalysis(null);
    setResults(null);
    setError(null);
    setIsAnalyzing(false);
    setProgress(null);
  }, []);

  const clearDraft = useCallback(() => {
    replaceImage(null);
  }, [replaceImage]);

  useEffect(() => {
    return () => {
      analyzeAbortRef.current?.abort();
      revokePreview(imageRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({
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
      clearDraft,
      analyzeAbortRef,
    }),
    [
      image,
      analysis,
      results,
      error,
      isAnalyzing,
      isRegistering,
      progress,
      replaceImage,
      clearDraft,
    ],
  );

  return (
    <AttendanceDraftContext.Provider value={value}>
      {children}
    </AttendanceDraftContext.Provider>
  );
}

export function useAttendanceDraft() {
  const value = useContext(AttendanceDraftContext);
  if (!value) {
    throw new Error("AttendanceDraftProvider がありません。");
  }
  return value;
}
