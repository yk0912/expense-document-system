import type { ReviewReceipt } from "@/types/receipt";

export function isReceiptReadyToRegister(receipt: ReviewReceipt): boolean {
  return (
    Boolean(receipt.assignedStore) &&
    Boolean(receipt.transactionDate) &&
    Boolean(receipt.vendorName.trim()) &&
    receipt.priceBasis !== "unknown" &&
    receipt.items.length > 0 &&
    receipt.items.every(
      (item) => item.name.trim() && item.amount !== null && Boolean(item.category),
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
