import { NextResponse } from "next/server";

import { fetchCategoryMaster } from "@/lib/accounting/category-master";
import { FORMAT_SHEET_NAME } from "@/lib/settings/types";
import { resolveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

export async function GET(request: Request) {
  const settings = await resolveAppSettings(request);
  const result = await fetchCategoryMaster({
    spreadsheetId: settings.spreadsheetId,
    summarySheetName: FORMAT_SHEET_NAME,
    categorySheetName: settings.categorySheetName,
  });
  return NextResponse.json({
    ok: result.categories.length > 0,
    count: result.categories.length,
    warning: result.warning,
  });
}
