import { NextResponse } from "next/server";

import { fetchCategoryMaster } from "@/lib/accounting/category-master";

export const maxDuration = 30;

export async function GET() {
  const result = await fetchCategoryMaster();
  return NextResponse.json({
    ok: result.categories.length > 0,
    count: result.categories.length,
    warning: result.warning,
  });
}
