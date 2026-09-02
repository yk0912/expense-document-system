import type { ReviewReceipt } from "@/types/receipt";

export const ISSUE_FIELDS = [
  { key: "vendorName", label: "取引先" },
  { key: "transactionDate", label: "購入日" },
  { key: "assignedStore", label: "店舗" },
  { key: "priceBasis", label: "税込/税抜" },
  { key: "totalAmount", label: "合計金額" },
  { key: "itemName", label: "商品名" },
  { key: "itemAmount", label: "商品金額" },
  { key: "category", label: "経費区分" },
  { key: "lineItems", label: "商品明細" },
  { key: "wholeReceipt", label: "レシート全体が読めない" },
] as const;

export type IssueFieldKey = (typeof ISSUE_FIELDS)[number]["key"];

const LABEL_BY_KEY = new Map(
  ISSUE_FIELDS.map((field) => [field.key, field.label]),
);

export function issueFieldLabel(key: string): string {
  return LABEL_BY_KEY.get(key as IssueFieldKey) ?? key;
}

export function detectIssueFields(receipt: ReviewReceipt): IssueFieldKey[] {
  const keys = new Set<IssueFieldKey>();

  if (!receipt.vendorName.trim()) {
    keys.add("vendorName");
  }
  if (!receipt.transactionDate) {
    keys.add("transactionDate");
  }
  if (!receipt.storeName?.trim() && !receipt.storeAddress?.trim()) {
    keys.add("assignedStore");
  }
  if (receipt.priceBasis === "unknown") {
    keys.add("priceBasis");
  }
  if (receipt.totalAmount === null) {
    keys.add("totalAmount");
  }
  if (receipt.items.length === 0) {
    keys.add("lineItems");
  }
  if (receipt.items.some((item) => !item.name.trim())) {
    keys.add("itemName");
  }
  if (receipt.items.some((item) => item.amount === null)) {
    keys.add("itemAmount");
  }
  if (
    receipt.items.some(
      (item) => !item.category || item.requiresReview,
    )
  ) {
    keys.add("category");
  }

  return ISSUE_FIELDS.map((field) => field.key).filter((key) => keys.has(key));
}

export function receiptsHaveIssueFields(receipts: ReviewReceipt[]): boolean {
  return receipts.some((receipt) => detectIssueFields(receipt).length > 0);
}
