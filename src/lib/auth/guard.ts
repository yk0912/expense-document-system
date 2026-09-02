import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, type SessionUser } from "@/lib/auth/constants";
import { decodeSession } from "@/lib/auth/session";

export async function readRequestSession(request?: Request): Promise<SessionUser | null> {
  if (request) {
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    const token = cookie?.slice(SESSION_COOKIE.length + 1);
    return decodeSession(token ? decodeURIComponent(token) : null);
  }
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value ?? null);
}

export async function requireSession(request?: Request): Promise<SessionUser | NextResponse> {
  const session = await readRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  }
  return session;
}

export async function requireAdmin(request?: Request): Promise<SessionUser | NextResponse> {
  const session = await requireSession(request);
  if (session instanceof NextResponse) {
    return session;
  }
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "管理者でログインしてください。" },
      { status: 403 },
    );
  }
  return session;
}
