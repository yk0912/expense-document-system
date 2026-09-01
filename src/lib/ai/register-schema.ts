import { z } from "zod";

import { STORES } from "@/types/receipt";

export const registerItemSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number(),
  category: z.string().trim().min(1),
});

export const registerReceiptSchema = z.object({
  receiptIndex: z.number().int().positive().optional(),
  assignedStore: z.enum(STORES),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendorName: z.string().trim().min(1),
  totalAmount: z.number().nullable(),
  lineTotal: z.number().nullable().optional(),
  priceBasis: z.enum(["tax_included", "tax_excluded"]),
  items: z.array(registerItemSchema).min(1),
});

export const registerPayloadSchema = z.object({
  imageToken: z.string().uuid().optional(),
  receipts: z.array(registerReceiptSchema).min(1),
});

export type RegisterReceiptInput = z.infer<typeof registerReceiptSchema>;
