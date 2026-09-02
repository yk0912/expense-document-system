import { NextResponse } from "next/server";

import { resolveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

export async function GET(request: Request) {
  const settings = await resolveAppSettings(request);
  return NextResponse.json(settings);
}
