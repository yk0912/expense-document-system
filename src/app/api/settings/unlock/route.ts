import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/guard";
import { getAdminPassword } from "@/lib/auth/password";
import { passwordsMatch } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
  password: z.string(),
});

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) {
    return session;
  }
  try {
    const body = payloadSchema.parse(await request.json());
    if (!passwordsMatch(body.password, await getAdminPassword())) {
      return NextResponse.json({ unlocked: false }, { status: 401 });
    }
    return NextResponse.json({ unlocked: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ unlocked: false }, { status: 400 });
    }
    return NextResponse.json({ unlocked: false }, { status: 500 });
  }
}
