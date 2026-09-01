const ILLEGAL = /[\\/:*?"<>|\s]+/g;

export function sanitizeFileToken(value: string, maxLength = 40): string {
  const cleaned = value.replace(ILLEGAL, "").trim();
  return (cleaned || "receipt").slice(0, maxLength);
}

export function toCompactDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

export function buildReceiptFileName(input: {
  transactionDate: string;
  vendorName: string;
  amount: number;
  shortId: string;
}): string {
  const date = toCompactDate(input.transactionDate);
  const vendor = sanitizeFileToken(input.vendorName);
  const amount = Math.round(input.amount);
  return `${date}_${vendor}_${amount}_${input.shortId}.jpg`;
}

export function buildSharedReceiptFileName(input: {
  receipts: Array<{
    transactionDate: string;
    vendorName: string;
    amount: number;
  }>;
  shortId: string;
}): string {
  const first = input.receipts[0];
  if (!first) {
    return `receipt_${input.shortId}.jpg`;
  }
  if (input.receipts.length === 1) {
    return buildReceiptFileName({ ...first, shortId: input.shortId });
  }
  const date = toCompactDate(first.transactionDate);
  const vendor = sanitizeFileToken(first.vendorName, 24);
  const extra = input.receipts.length - 1;
  return `${date}_${vendor}他${extra}件_${input.shortId}.jpg`;
}

export function yearMonthFromDate(isoDate: string): { year: string; month: string } {
  const [year, month] = isoDate.split("-");
  return { year, month };
}
