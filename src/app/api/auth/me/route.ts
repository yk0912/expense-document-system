import { NextResponse } from "next/server";

import { readRequestSession } from "@/lib/auth/guard";

export async function GET(request: Request) {
  const session = await readRequestSession(request);
  return NextResponse.json(session);
}
