import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminPassword } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/guard";
import { passwordsMatch } from "@/lib/auth/session";
import { listAppUsers, publicUsers, saveAppUsers } from "@/lib/auth/users";
import { parseSpreadsheetId } from "@/lib/settings/parse";
import { resolveAppSettings } from "@/lib/settings/server";

export const maxDuration = 30;

const saveSchema = z.object({
  password: z.string(),
  users: z.array(
    z.object({
      name: z.string().trim().min(1),
      role: z.enum(["admin", "user"]).optional(),
      password: z.string().optional(),
    }),
  ),
});

export async function GET(request: Request) {
  try {
    const settings = await resolveAppSettings(request);
    const users = await listAppUsers({
      spreadsheetId: settings.usersSpreadsheetId || settings.spreadsheetId,
      sheetName: settings.usersSheetName,
    });
    return NextResponse.json({ users: publicUsers(users) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ユーザー一覧の取得に失敗しました。",
        users: publicUsers([]),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }
  try {
    const body = saveSchema.parse(await request.json());
    if (!passwordsMatch(body.password, getAdminPassword())) {
      return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
    }
    const settings = await resolveAppSettings(request);
    const spreadsheetId =
      parseSpreadsheetId(settings.usersSpreadsheetId) || settings.spreadsheetId;
    const users = await saveAppUsers({
      spreadsheetId,
      sheetName: settings.usersSheetName,
      users: body.users,
    });
    return NextResponse.json({ users: publicUsers(users) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "ユーザー名を入力してください。" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ユーザーの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
