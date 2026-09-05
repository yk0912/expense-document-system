import {
  explainedByConsumptionTax,
  explainedByItemTaxRates,
  looksLikeConsumptionTaxGap,
  defaultTaxRateForCategory,
  normalizeItemTaxRate,
  sumAmounts,
  taxBreakdownFromItems,
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
  categories: CategoryMasterItem[],
): ReviewItem {
  const suggested = item.suggestedCategory ?? item.category ?? null;
  const resolved = suggested
    ? matchCategoryName(suggested, categoryNames)
    : null;
  const category = resolved ?? (masterEmpty ? suggested : null);
  const extractedTaxRate = item.taxRate ?? null;
  const taxRate =
    extractedTaxRate !== null && extractedTaxRate !== 0
      ? normalizeItemTaxRate(extractedTaxRate)
      : defaultTaxRateForCategory(category, categories);

  return {
    clientId: createId("item", index),
    name: item.name ?? "",
    quantity: item.quantity ?? null,
    unitPrice: item.unitPrice ?? null,
    amount: item.amount,
    taxRate,
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
    taxRate: 0,
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

function isGeneratedWarning(warning: string): boolean {
  return (
    warning.includes("一致しません") ||
    warning.includes("税率を加味すると") ||
    warning.includes("各商品の税抜合計") ||
    warning.includes("レシート記載の") ||
    warning.includes("対象合計")
  );
}

function printedTotal(receipt: ReviewReceipt): number | null {
  return receipt.extractedTotalAmount ?? receipt.totalAmount;
}

function reconcilePrintedAndItems(
  receipt: ReviewReceipt,
  lineTotal: number | null,
): string[] {
  const warnings: string[] = [];
  const subtotal = receipt.extractedSubtotalAmount;
  const tax8 = receipt.extractedTaxAmount8;
  const tax10 = receipt.extractedTaxAmount10;
  const taxable8 = receipt.extractedTaxableAmount8;
  const taxable10 = receipt.extractedTaxableAmount10;
  const total = printedTotal(receipt);
  const fromItems = taxBreakdownFromItems(
    receipt.entryMode === "line_items" ? receipt.items : receipt.extractedItems,
  );

  if (
    subtotal !== null &&
    total !== null &&
    (tax8 !== null || tax10 !== null)
  ) {
    const printedSum = subtotal + (tax8 ?? 0) + (tax10 ?? 0);
    if (printedSum !== total) {
      warnings.push(
        `レシート記載の小計＋消費税（${printedSum.toLocaleString()}円）が合計（${total.toLocaleString()}円）と${Math.abs(printedSum - total).toLocaleString()}円一致しません。記載値は補正していません。`,
      );
    }
  }

  if (
    receipt.entryMode === "line_items" &&
    lineTotal !== null &&
    subtotal !== null &&
    lineTotal !== subtotal
  ) {
    warnings.push(
      `各商品の税抜合計（${lineTotal.toLocaleString()}円）が小計（${subtotal.toLocaleString()}円）と${Math.abs(lineTotal - subtotal).toLocaleString()}円一致しません。読み取れなかった商品がある可能性があります。`,
    );
  }

  if (
    receipt.entryMode === "line_items" &&
    fromItems.tax8 !== null &&
    tax8 !== null &&
    fromItems.tax8 !== tax8
  ) {
    warnings.push(
      `各商品から計算した消費税8%（${fromItems.tax8.toLocaleString()}円）が記載額（${tax8.toLocaleString()}円）と一致しません。`,
    );
  }

  if (
    receipt.entryMode === "line_items" &&
    fromItems.tax10 !== null &&
    tax10 !== null &&
    fromItems.tax10 !== tax10
  ) {
    warnings.push(
      `各商品から計算した消費税10%（${fromItems.tax10.toLocaleString()}円）が記載額（${tax10.toLocaleString()}円）と一致しません。`,
    );
  }

  if (
    receipt.entryMode === "line_items" &&
    taxable8 !== null &&
    fromItems.taxable8 !== taxable8
  ) {
    warnings.push(
      fromItems.taxable8 === null
        ? `レシートに8%対象合計（${taxable8.toLocaleString()}円）がありますが、消費税8%の商品がありません。`
        : `各商品の8%対象合計（${fromItems.taxable8.toLocaleString()}円）が記載額（${taxable8.toLocaleString()}円）と一致しません。`,
    );
  }

  if (
    receipt.entryMode === "line_items" &&
    taxable10 !== null &&
    fromItems.taxable10 !== taxable10
  ) {
    warnings.push(
      fromItems.taxable10 === null
        ? `レシートに10%対象合計（${taxable10.toLocaleString()}円）がありますが、消費税10%の商品がありません。`
        : `各商品の10%対象合計（${fromItems.taxable10.toLocaleString()}円）が記載額（${taxable10.toLocaleString()}円）と一致しません。`,
    );
  }

  return warnings;
}

export function summarizeReceipt(receipt: ReviewReceipt): ReviewReceipt {
  const printed = {
    subtotalAmount: receipt.extractedSubtotalAmount,
    taxAmount8: receipt.extractedTaxAmount8,
    taxAmount10: receipt.extractedTaxAmount10,
    taxableAmount8: receipt.extractedTaxableAmount8,
    taxableAmount10: receipt.extractedTaxableAmount10,
    totalAmount: printedTotal(receipt),
  };
  const fromItems = taxBreakdownFromItems(
    receipt.entryMode === "line_items" ? receipt.items : receipt.extractedItems,
  );
  const warnings = receipt.warnings.filter((warning) => !isGeneratedWarning(warning));

  if (receipt.entryMode === "lump_sum") {
    const amount = receipt.items[0]?.amount ?? printed.totalAmount;
    if (receipt.priceBasis === "unknown") {
      warnings.push("税込・税抜を確認してください");
    }
    warnings.push(...reconcilePrintedAndItems(receipt, null));

    return {
      ...receipt,
      ...printed,
      totalAmount: amount,
      lineTotal: amount,
      itemTaxAmount8: fromItems.tax8,
      itemTaxAmount10: fromItems.tax10,
      itemTaxableAmount8: fromItems.taxable8,
      itemTaxableAmount10: fromItems.taxable10,
      totalDifference: 0,
      warnings,
      taxReconciledRate: null,
    };
  }

  const lineTotal = sumAmounts(receipt.items.map((item) => item.amount));
  const totalDifference =
    printed.totalAmount !== null && lineTotal !== null
      ? printed.totalAmount - lineTotal
      : null;
  const taxRate =
    printed.totalAmount !== null && lineTotal !== null
      ? explainedByConsumptionTax(printed.totalAmount, lineTotal)
      : null;
  const itemRatesExplain =
    printed.totalAmount !== null
      ? explainedByItemTaxRates(printed.totalAmount, receipt.items)
      : false;
  const taxGap =
    printed.totalAmount !== null && lineTotal !== null
      ? looksLikeConsumptionTaxGap(printed.totalAmount, lineTotal)
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

  if (priceBasis === "unknown") {
    warnings.push("税込・税抜を確認してください");
  }
  warnings.push(...reconcilePrintedAndItems({ ...receipt, entryMode: "line_items" }, lineTotal));

  return {
    ...receipt,
    ...printed,
    priceBasis,
    lineTotal,
    itemTaxAmount8: fromItems.tax8,
    itemTaxAmount10: fromItems.tax10,
    itemTaxableAmount8: fromItems.taxable8,
    itemTaxableAmount10: fromItems.taxable10,
    totalDifference,
    warnings,
    taxReconciledRate: taxRate,
  };
}

export function replaceReceiptItems(
  receipt: ReviewReceipt,
  items: ReviewItem[],
  _options: { recalculateTotal?: boolean } = {},
): ReviewReceipt {
  return summarizeReceipt({
    ...receipt,
    items,
    extractedItems: receipt.entryMode === "line_items" ? items : receipt.extractedItems,
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
      receipt.extractedTotalAmount ??
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
      toReviewItem(item, itemIndex, categoryNames, masterEmpty, categories),
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
      subtotalAmount: receipt.subtotalAmount ?? null,
      taxAmount8: receipt.taxAmount8 ?? null,
      taxAmount10: receipt.taxAmount10 ?? null,
      extractedSubtotalAmount: receipt.subtotalAmount ?? null,
      extractedTaxAmount8: receipt.taxAmount8 ?? null,
      extractedTaxAmount10: receipt.taxAmount10 ?? null,
      extractedTaxableAmount8: receipt.taxableAmount8 ?? null,
      extractedTaxableAmount10: receipt.taxableAmount10 ?? null,
      extractedTotalAmount: receipt.totalAmount,
      taxableAmount8: receipt.taxableAmount8 ?? null,
      taxableAmount10: receipt.taxableAmount10 ?? null,
      itemTaxableAmount8: null,
      itemTaxableAmount10: null,
      itemTaxAmount8: null,
      itemTaxAmount10: null,
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
