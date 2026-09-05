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
import type { AnalyzeResponse, RegisterReceiptResult } from "@/types/receipt";

type ReceiptDraftContextValue = {
  image: CompressedReceiptImage | null;
  analysis: AnalyzeResponse | null;
  results: RegisterReceiptResult[] | null;
  error: string | null;
  isAnalyzing: boolean;
  isRegistering: boolean;
  progress: { label: string; percent: number } | null;
  setAnalysis: Dispatch<SetStateAction<AnalyzeResponse | null>>;
  setResults: Dispatch<SetStateAction<RegisterReceiptResult[] | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsAnalyzing: Dispatch<SetStateAction<boolean>>;
  setIsRegistering: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<{ label: string; percent: number } | null>>;
  replaceImage: (next: CompressedReceiptImage | null) => void;
  clearDraft: () => void;
  analyzeAbortRef: MutableRefObject<AbortController | null>;
};

const ReceiptDraftContext = createContext<ReceiptDraftContextValue | null>(null);

function revokePreview(image: CompressedReceiptImage | null) {
  if (image?.previewUrl) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export function ReceiptDraftProvider({ children }: { children: ReactNode }) {
  const [image, setImageState] = useState<CompressedReceiptImage | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [results, setResults] = useState<RegisterReceiptResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{
    label: string;
    percent: number;
  } | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const imageRef = useRef<CompressedReceiptImage | null>(null);
  imageRef.current = image;

  const replaceImage = useCallback((next: CompressedReceiptImage | null) => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    revokePreview(imageRef.current);
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
    <ReceiptDraftContext.Provider value={value}>{children}</ReceiptDraftContext.Provider>
  );
}

export function useReceiptDraft() {
  const value = useContext(ReceiptDraftContext);
  if (!value) {
    throw new Error("useReceiptDraft は ReceiptDraftProvider の中で使ってください");
  }
  return value;
}
