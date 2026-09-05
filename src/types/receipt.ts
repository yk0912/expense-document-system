export const STORES = ["府中店", "武蔵野店", "ミッテン", "運営"] as const;
export type Store = (typeof STORES)[number];

export const PRICE_BASES = ["tax_included", "tax_excluded", "unknown"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

export const VENDOR_KINDS = ["dining", "retail", "unknown"] as const;
export type VendorKind = (typeof VENDOR_KINDS)[number];

export const ENTRY_MODES = ["lump_sum", "line_items"] as const;
export type EntryMode = (typeof ENTRY_MODES)[number];

export const ITEM_TAX_RATES = [0, 1, 8, 10] as const;
export type ItemTaxRate = (typeof ITEM_TAX_RATES)[number];

export const TAX_KINDS = ["included", "excluded"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export type CategoryMasterItem = {
  name: string;
  examples: string | null;
  taxRate: string | null;
  description: string | null;
};

export type ReviewItem = {
  clientId: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  taxRate: number | null;
  taxKind: TaxKind | null;
  itemType: "item" | "discount" | "coupon" | "point";
  category: string | null;
  categoryConfidence: number | null;
  requiresReview: boolean;
};

export type ReviewReceipt = {
  clientId: string;
  receiptIndex: number;
  storeName: string | null;
  storeAddress: string | null;
  assignedStore: Store;
  transactionDate: string | null;
  vendorName: string;
  totalAmount: number | null;
  subtotalAmount: number | null;
  taxAmount8: number | null;
  taxAmount10: number | null;
  extractedSubtotalAmount: number | null;
  extractedTaxAmount8: number | null;
  extractedTaxAmount10: number | null;
  extractedTaxableAmount8: number | null;
  extractedTaxableAmount10: number | null;
  extractedTotalAmount: number | null;
  taxableAmount8: number | null;
  taxableAmount10: number | null;
  itemTaxableAmount8: number | null;
  itemTaxableAmount10: number | null;
  itemTaxAmount8: number | null;
  itemTaxAmount10: number | null;
  itemInclusiveTotal: number | null;
  taxKind8: TaxKind | null;
  taxKind10: TaxKind | null;
  taxKind8Locked?: boolean;
  taxKind10Locked?: boolean;
  priceBasis: PriceBasis;
  vendorKind: VendorKind;
  entryMode: EntryMode;
  extractedItems: ReviewItem[];
  items: ReviewItem[];
  lineTotal: number | null;
  totalDifference: number | null;
  taxReconciledRate: 8 | 10 | null;
  warnings: string[];
};

export type AnalyzeResponse = {
  imageToken: string;
  receipts: ReviewReceipt[];
  categories: CategoryMasterItem[];
  categoryMasterWarning: string | null;
};

export type RegisterReceiptResult = {
  receiptIndex: number;
  vendorName: string | null;
  ok: boolean;
  sheetTitle: string | null;
  rowNumber: number | null;
  fileName: string | null;
  fileUrl: string | null;
  duplicates: Array<{
    rowNumber: number;
    vendorName: string;
    transactionDate: string;
  }>;
  error: string | null;
};

export type RegisterResponse = {
  results: RegisterReceiptResult[];
};
