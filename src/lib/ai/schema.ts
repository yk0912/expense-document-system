import { z } from "zod";

export const geminiReceiptItemSchema = z.object({
  name: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
  taxRate: z.number().nullable(),
  itemType: z.enum(["item", "discount", "coupon", "point"]),
  suggestedCategory: z.string().nullable(),
  categoryConfidence: z.number().nullable(),
  requiresReview: z.boolean(),
});

export const geminiReceiptSchema = z.object({
  receiptIndex: z.number().int(),
  storeName: z.string().nullable(),
  storeAddress: z.string().nullable(),
  transactionDate: z.string().nullable(),
  transactionTime: z.string().nullable(),
  totalAmount: z.number().nullable(),
  priceBasis: z.enum(["tax_included", "tax_excluded", "unknown"]),
  vendorKind: z.enum(["dining", "retail", "unknown"]),
  suggestedLumpCategory: z.string().nullable(),
  warnings: z.array(z.string()),
  boundingBox: z.array(z.number()).max(4).nullable(),
  items: z.array(geminiReceiptItemSchema),
});

export const geminiReceiptAnalysisSchema = z.object({
  receipts: z.array(geminiReceiptSchema).min(1),
});

export type GeminiReceiptAnalysis = z.infer<typeof geminiReceiptAnalysisSchema>;

export function geminiResponseJsonSchema(): Record<string, unknown> {
  const schema = geminiReceiptAnalysisSchema.toJSONSchema({
    target: "draft-07",
  }) as Record<string, unknown>;
  delete schema.$schema;
  stripUnsupportedJsonSchemaKeywords(schema);
  return schema;
}

function stripUnsupportedJsonSchemaKeywords(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(stripUnsupportedJsonSchemaKeywords);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  delete record.pattern;
  delete record.format;
  for (const nested of Object.values(record)) {
    stripUnsupportedJsonSchemaKeywords(nested);
  }
}
