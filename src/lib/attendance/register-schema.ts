import { z } from "zod";

export const attendanceWriteDaySchema = z.object({
  day: z.number().int(),
  actualHours: z.number().nullable(),
  earlyHours: z.number().nullable(),
  transportYen: z.number().nullable(),
  cleared: z.boolean(),
});

export const attendanceWriteSheetSchema = z.object({
  sheetIndex: z.number().int(),
  employeeName: z.string(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  days: z.array(attendanceWriteDaySchema),
});

export const attendanceRegisterPayloadSchema = z.object({
  dryRun: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  sheets: z.array(attendanceWriteSheetSchema).min(1),
});
