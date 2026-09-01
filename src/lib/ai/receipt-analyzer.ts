import type { CategoryMasterItem } from "@/types/receipt";
import type { GeminiReceiptAnalysis } from "@/lib/ai/schema";

export type ReceiptAnalyzer = {
  analyze(
    image: Buffer,
    mimeType: string,
    categories: CategoryMasterItem[],
  ): Promise<GeminiReceiptAnalysis>;
};
