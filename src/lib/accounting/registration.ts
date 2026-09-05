import { itemTaxPercent } from "@/lib/accounting/amount-check";
import type { ReviewItem, ReviewReceipt } from "@/types/receipt";

export function missingItemSettings(
  item: ReviewItem,
  options: { lumpSum?: boolean } = {},
): string[] {
  const missing: string[] = [];
  if (!item.name.trim()) {
    missing.push(options.lumpSum ? "内容" : "商品名");
  }
  if (item.amount === null) {
    missing.push("金額");
  }
  if (!item.category) {
    missing.push("区分");
  }
  if (!options.lumpSum) {
    if (item.taxRate === null) {
      missing.push("税率");
    }
    const percent = itemTaxPercent(item.taxRate);
    if (
      (percent === 8 || percent === 10) &&
      item.taxKind !== "included" &&
      item.taxKind !== "excluded"
    ) {
      missing.push("内税/外税");
    }
  }
  return missing;
}

export function isReceiptReadyToRegister(receipt: ReviewReceipt): boolean {
  const lumpSum = receipt.entryMode === "lump_sum";
  return (
    Boolean(receipt.assignedStore) &&
    Boolean(receipt.transactionDate) &&
    Boolean(receipt.vendorName.trim()) &&
    receipt.priceBasis !== "unknown" &&
    receipt.items.length > 0 &&
    receipt.items.every(
      (item) => missingItemSettings(item, { lumpSum }).length === 0,
    )
  );
}

export function resolveTaxIncludedTotal(receipt: {
  extractedTotalAmount?: number | null;
  totalAmount: number | null;
}): number | null {
  return receipt.extractedTotalAmount ?? null;
}

export function resolveReceiptTotal(receipt: {
  extractedTotalAmount?: number | null;
  totalAmount: number | null;
  lineTotal?: number | null;
  items: Array<{ amount: number | null }>;
}): number {
  const taxIncluded = resolveTaxIncludedTotal(receipt);
  if (taxIncluded !== null) {
    return taxIncluded;
  }
  if (receipt.totalAmount !== null) {
    return receipt.totalAmount;
  }
  if (receipt.lineTotal !== null && receipt.lineTotal !== undefined) {
    return receipt.lineTotal;
  }
  return receipt.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}
