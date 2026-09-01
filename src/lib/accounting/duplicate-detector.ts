import type { SummaryColumns } from "@/lib/accounting/sheet-column-resolver";

export type DuplicateMatch = {
  rowNumber: number;
  vendorName: string;
  transactionDate: string;
};

function normalizeVendor(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function excelSerialToYmd(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial) * 86_400_000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20_000 && serial < 80_000) {
      return excelSerialToYmd(serial);
    }
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 8) {
    return digits.slice(0, 8);
  }
  return trimmed;
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/[^\d.-]/g, "");
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function findDuplicateRows(
  rows: string[][],
  columns: SummaryColumns,
  candidate: {
    transactionDate: string;
    vendorName: string;
    total: number;
  },
): DuplicateMatch[] {
  const targetDate = normalizeDate(candidate.transactionDate);
  const targetVendor = normalizeVendor(candidate.vendorName);
  const matches: DuplicateMatch[] = [];

  rows.forEach((row, index) => {
    if (index === 0) {
      return;
    }
    const date = normalizeDate(row[columns.date] ?? "");
    const vendor = normalizeVendor(row[columns.vendor] ?? "");
    const totalRaw =
      columns.total === null ? "" : (row[columns.total] ?? "");
    const total = parseAmount(totalRaw);

    if (
      date === targetDate &&
      vendor === targetVendor &&
      total !== null &&
      total === candidate.total
    ) {
      matches.push({
        rowNumber: index + 1,
        vendorName: row[columns.vendor] ?? "",
        transactionDate: row[columns.date] ?? "",
      });
    }
  });

  return matches;
}
