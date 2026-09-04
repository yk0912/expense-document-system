import {
  explainedByConsumptionTax,
  explainedByItemTaxRates,
  looksLikeConsumptionTaxGap,
  sumAmounts,
} from "@/lib/accounting/amount-check";
import { matchCategoryName } from "@/lib/accounting/category-column";
import { parseTransactionDate } from "@/lib/accounting/date";
import { resolveStore } from "@/lib/accounting/store-resolver";
import {
  hasUsableLineItems,
  resolveEntryMode,
  resolveVendorKind,
  suggestDiningCategory,
} from "@/lib/accounting/vendor-kind";
import type { GeminiReceiptAnalysis } from "@/lib/ai/schema";
import type {
  AnalyzeResponse,
  CategoryMasterItem,
  EntryMode,
  ReviewItem,
  ReviewReceipt,
} from "@/types/receipt";

function createId(prefix: string, index: number): string {
  return `${prefix}-${index}-${crypto.randomUUID().slice(0, 8)}`;
}

function toReviewItem(
  item: {
    name?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    amount: number | null;
    taxRate?: number | null;
    itemType?: ReviewItem["itemType"];
    suggestedCategory?: string | null;
    category?: string | null;
    categoryConfidence?: number | null;
    requiresReview?: boolean;
  },
  index: number,
  categoryNames: Set<string>,
  masterEmpty: boolean,
): ReviewItem {
  const suggested = item.suggestedCategory ?? item.category ?? null;
  const resolved = suggested
    ? matchCategoryName(suggested, categoryNames)
    : null;
  const category = resolved ?? (masterEmpty ? suggested : null);

  return {
    clientId: createId("item", index),
    name: item.name ?? "",
    quantity: item.quantity ?? null,
    unitPrice: item.unitPrice ?? null,
    amount: item.amount,
    taxRate: item.taxRate ?? null,
    itemType: item.itemType ?? "item",
    category,
    categoryConfidence: item.categoryConfidence ?? null,
    requiresReview: item.requiresReview || !category || item.amount === null || !item.name,
  };
}

export function defaultLumpItemName(vendorKind: ReviewReceipt["vendorKind"]): string {
  return vendorKind === "dining" ? "飲食代" : "合計";
}

export function createEmptyReviewItem(): ReviewItem {
  return {
    clientId: createId("item", 0),
    name: "",
    quantity: null,
    unitPrice: null,
    amount: null,
    taxRate: null,
    itemType: "item",
    category: null,
    categoryConfidence: null,
    requiresReview: true,
  };
}

function createLumpItem(
  amount: number | null,
  category: string | null,
  existing: ReviewItem | undefined,
  vendorKind: ReviewReceipt["vendorKind"],
  extractedNames: ReadonlySet<string>,
): ReviewItem {
  const existingName = existing?.name?.trim() ?? "";
  const keepEditedName = Boolean(existingName) && !extractedNames.has(existingName);
  return {
    clientId: existing?.clientId ?? createId("lump", 0),
    name: keepEditedName ? existingName : defaultLumpItemName(vendorKind),
    quantity: 1,
    unitPrice: amount,
    amount,
    taxRate: null,
    itemType: "item",
    category,
    categoryConfidence: category ? 0.8 : null,
    requiresReview: !category || amount === null,
  };
}

export function summarizeReceipt(receipt: ReviewReceipt): ReviewReceipt {
  if (receipt.entryMode === "lump_sum") {
    const amount = receipt.items[0]?.amount ?? receipt.totalAmount;
    const warnings = receipt.warnings.filter(
      (warning) =>
        !warning.includes("一致しません") &&
        !warning.includes("税率を加味すると"),
    );
    if (receipt.priceBasis === "unknown") {
      warnings.push("税込・税抜を確認してください");
    }

    return {
      ...receipt,
      totalAmount: amount,
      lineTotal: amount,
      totalDifference: 0,
      warnings,
      taxReconciledRate: null,
    };
  }

  const lineTotal = sumAmounts(receipt.items.map((item) => item.amount));
  const totalDifference =
    receipt.totalAmount !== null && lineTotal !== null
      ? receipt.totalAmount - lineTotal
      : null;
  const taxRate =
    receipt.totalAmount !== null && lineTotal !== null
      ? explainedByConsumptionTax(receipt.totalAmount, lineTotal)
      : null;
  const itemRatesExplain =
    receipt.totalAmount !== null
      ? explainedByItemTaxRates(receipt.totalAmount, receipt.items)
      : false;
  const taxGap =
    receipt.totalAmount !== null && lineTotal !== null
      ? looksLikeConsumptionTaxGap(receipt.totalAmount, lineTotal)
      : false;
  const lineItemsAreExclusive =
    receipt.priceBasis === "tax_excluded" ||
    Boolean(taxRate) ||
    itemRatesExplain ||
    taxGap;
  const priceBasis =
    receipt.priceBasis === "unknown" && lineItemsAreExclusive
      ? "tax_excluded"
      : receipt.priceBasis;

  const warnings = receipt.warnings.filter(
    (warning) =>
      !warning.includes("一致しません") &&
      !warning.includes("税率を加味すると"),
  );

  if (
    priceBasis === "tax_included" &&
    !lineItemsAreExclusive &&
    totalDifference !== null &&
    totalDifference !== 0
  ) {
    warnings.push(
      `レシート合計：${receipt.totalAmount?.toLocaleString()}円 / 明細合計：${lineTotal?.toLocaleString()}円 / ${Math.abs(totalDifference).toLocaleString()}円一致しません。自動補正はしていません。`,
    );
  }

  if (priceBasis === "unknown") {
    warnings.push("税込・税抜を確認してください");
  }

  return {
    ...receipt,
    priceBasis,
    lineTotal,
    totalDifference,
    warnings,
    taxReconciledRate: taxRate,
  };
}

export function replaceReceiptItems(
  receipt: ReviewReceipt,
  items: ReviewItem[],
  options: { recalculateTotal?: boolean } = {},
): ReviewReceipt {
  const next = summarizeReceipt({
    ...receipt,
    items,
    extractedItems: receipt.entryMode === "line_items" ? items : receipt.extractedItems,
  });
  if (
    !options.recalculateTotal ||
    next.lineTotal === null ||
    next.priceBasis !== "tax_included" ||
    next.taxReconciledRate !== null ||
    (next.totalAmount !== null &&
      looksLikeConsumptionTaxGap(next.totalAmount, next.lineTotal))
  ) {
    return next;
  }
  return summarizeReceipt({
    ...next,
    totalAmount: next.lineTotal,
  });
}

export function applyEntryMode(
  receipt: ReviewReceipt,
  entryMode: EntryMode,
  categories: CategoryMasterItem[],
  hintedLumpCategory: string | null = null,
): ReviewReceipt {
  if (entryMode === "lump_sum") {
    const currentCategory =
      receipt.entryMode === "lump_sum" ? receipt.items[0]?.category ?? null : null;
    const category =
      currentCategory ??
      suggestDiningCategory(categories, hintedLumpCategory);
    const amount =
      receipt.totalAmount ??
      sumAmounts(receipt.extractedItems.map((item) => item.amount));
    const extractedNames = new Set(
      receipt.extractedItems
        .map((item) => item.name.trim())
        .filter(Boolean),
    );

    return summarizeReceipt({
      ...receipt,
      entryMode,
      items: [
        createLumpItem(
          amount,
          category,
          receipt.items[0],
          receipt.vendorKind,
          extractedNames,
        ),
      ],
    });
  }

  return summarizeReceipt({
    ...receipt,
    entryMode,
    items:
      receipt.extractedItems.length > 0 ? receipt.extractedItems : receipt.items,
  });
}

export function toAnalyzeResponse(
  analysis: GeminiReceiptAnalysis,
  categories: CategoryMasterItem[],
  categoryMasterWarning: string | null,
  imageToken: string,
): AnalyzeResponse {
  const categoryNames = new Set(categories.map((category) => category.name));
  const masterEmpty = categories.length === 0;

  const receipts: ReviewReceipt[] = analysis.receipts.map((receipt, receiptIndex) => {
    const extractedItems = receipt.items.map((item, itemIndex) =>
      toReviewItem(item, itemIndex, categoryNames, masterEmpty),
    );
    const vendorKind = resolveVendorKind(
      receipt.storeName,
      receipt.storeAddress,
      receipt.vendorKind,
    );
    const entryMode = resolveEntryMode(
      vendorKind,
      hasUsableLineItems(receipt.items),
      receipt.totalAmount,
    );
    const lumpCategory = suggestDiningCategory(
      categories,
      receipt.suggestedLumpCategory,
    );

    const base: ReviewReceipt = {
      clientId: createId("receipt", receiptIndex),
      receiptIndex: receiptIndex + 1,
      storeName: receipt.storeName,
      storeAddress: receipt.storeAddress,
      assignedStore: resolveStore(receipt.storeName, receipt.storeAddress),
      transactionDate: parseTransactionDate(receipt.transactionDate),
      vendorName: receipt.storeName ?? "",
      totalAmount: receipt.totalAmount,
      priceBasis: receipt.priceBasis,
      vendorKind,
      entryMode,
      extractedItems,
      items: extractedItems,
      lineTotal: null,
      totalDifference: null,
      warnings: [...receipt.warnings],
      taxReconciledRate: null,
    };

    return applyEntryMode(base, entryMode, categories, lumpCategory);
  });

  const suggestedNames = receipts.flatMap((receipt) =>
    receipt.items
      .map((item) => item.category)
      .filter((name): name is string => Boolean(name)),
  );
  const mergedCategories = masterEmpty
    ? [
        ...categories,
        ...suggestedNames
          .filter((name) => !categoryNames.has(name))
          .map((name) => ({
            name,
            examples: null,
            taxRate: null,
            description: null,
          })),
      ]
    : categories;

  return {
    imageToken,
    receipts,
    categories: mergedCategories,
    categoryMasterWarning,
  };
}
