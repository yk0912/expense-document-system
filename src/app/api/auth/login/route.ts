import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminPassword } from "@/lib/auth/password";
import {
  encodeSession,
  passwordsMatch,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { listAppUsers } from "@/lib/auth/users";
import { resolveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

const payloadSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = payloadSchema.parse(await request.json());
    const settings = await resolveAppSettings(request);
    const users = await listAppUsers({
      spreadsheetId: settings.usersSpreadsheetId || settings.spreadsheetId,
      sheetName: settings.usersSheetName,
    });
    const user = users.find((item) => item.name === body.name);
    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません。" },
        { status: 401 },
      );
    }
    if (user.role === "admin") {
      const password = body.password ?? "";
      const expected = user.password || getAdminPassword();
      if (!passwordsMatch(password, expected) && !passwordsMatch(password, getAdminPassword())) {
        return NextResponse.json(
          { error: "パスワードが違います。" },
          { status: 401 },
        );
      }
    }
    const token = await encodeSession({
      name: user.name,
      isAdmin: user.role === "admin",
    });
    const response = NextResponse.json({
      name: user.name,
      isAdmin: user.role === "admin",
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "ユーザーを選んでください。" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ログインに失敗しました。",
      },
      { status: 500 },
    );
  }
}
