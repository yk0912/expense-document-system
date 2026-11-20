import { z } from "zod";

export const geminiAttendanceDaySchema = z.object({
  day: z.number().int(),
  workStart: z.string().nullable(),
  workEnd: z.string().nullable(),
  breakStart: z.string().nullable(),
  breakEnd: z.string().nullable(),
  actualHours: z.number().nullable(),
  transportYen: z.number().nullable(),
  note: z.string().nullable(),
  supervisorSigned: z.boolean().nullable(),
  overtimeApproved: z.boolean().nullable(),
});

export const geminiAttendanceSheetSchema = z.object({
  sheetIndex: z.number().int(),
  employeeName: z.string().nullable(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  headerNote: z.string().nullable(),
  days: z.array(geminiAttendanceDaySchema),
  warnings: z.array(z.string()),
});

export const geminiAttendanceAnalysisSchema = z.object({
  sheets: z.array(geminiAttendanceSheetSchema).min(1),
});

export type GeminiAttendanceAnalysis = z.infer<typeof geminiAttendanceAnalysisSchema>;

export function geminiAttendanceJsonSchema(): Record<string, unknown> {
  const schema = geminiAttendanceAnalysisSchema.toJSONSchema({
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

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,¥￥円\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (["true", "あり", "有", "済", "signed"].includes(text)) {
      return true;
    }
    if (["false", "なし", "無", "空欄"].includes(text)) {
      return false;
    }
  }
  return null;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text || null;
}

export function sanitizeAttendanceAnalysis(value: unknown): unknown {
  const root = value && typeof value === "object" ? (value as { sheets?: unknown }) : {};
  const sheets = Array.isArray(root.sheets) ? root.sheets : [];
  return {
    sheets: sheets.map((sheet, sheetIndex) => {
      const record = sheet && typeof sheet === "object" ? (sheet as Record<string, unknown>) : {};
      const days = Array.isArray(record.days) ? record.days : [];
      return {
        sheetIndex:
          typeof record.sheetIndex === "number" ? record.sheetIndex : sheetIndex + 1,
        employeeName: nullableString(record.employeeName),
        year: nullableNumber(record.year),
        month: nullableNumber(record.month),
        headerNote: nullableString(record.headerNote),
        warnings: Array.isArray(record.warnings)
          ? record.warnings.filter((item): item is string => typeof item === "string")
          : [],
        days: days.map((day) => {
          const item = day && typeof day === "object" ? (day as Record<string, unknown>) : {};
          return {
            day: nullableNumber(item.day) ?? 0,
            workStart: nullableString(item.workStart),
            workEnd: nullableString(item.workEnd),
            breakStart: nullableString(item.breakStart),
            breakEnd: nullableString(item.breakEnd),
            actualHours: nullableNumber(item.actualHours),
            transportYen: nullableNumber(item.transportYen),
            note: nullableString(item.note),
            supervisorSigned: nullableBoolean(item.supervisorSigned),
            overtimeApproved: nullableBoolean(item.overtimeApproved),
          };
        }),
      };
    }),
  };
}
