import { google, type sheets_v4 } from "googleapis";

import {
  ADMIN_USER_NAME,
  DEFAULT_USERS_SHEET_NAME,
  type AppUser,
} from "@/lib/auth/constants";
import { getAdminPassword } from "@/lib/auth/password";
import { createGoogleOAuthClient } from "@/lib/google/auth";
import { toGoogleErrorMessage } from "@/lib/google/errors";

type SheetsAuth = Parameters<typeof google.sheets>[0]["auth"];

const HEADERS = ["ユーザー名", "役割", "パスワード"] as const;

function sheetsClient(auth: SheetsAuth) {
  return google.sheets({ version: "v4", auth });
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function defaultUsers(adminPassword: string): AppUser[] {
  return [
    {
      name: ADMIN_USER_NAME,
      role: "admin",
      password: adminPassword,
    },
  ];
}

function flatten(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function isAdminRole(value: string): boolean {
  return flatten(value) === "管理者" || flatten(value).toLowerCase() === "admin";
}

function toPublicUser(user: AppUser): { name: string; role: AppUser["role"] } {
  return { name: user.name, role: user.role };
}

async function findSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
): Promise<{ sheetId: number; title: string } | null> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const existing = meta.data.sheets?.find(
    (sheet) => sheet.properties?.title === title,
  );
  if (existing?.properties?.sheetId == null || !existing.properties.title) {
    return null;
  }
  return {
    sheetId: existing.properties.sheetId,
    title: existing.properties.title,
  };
}

async function ensureUsersSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
): Promise<{ sheetId: number; title: string }> {
  const existing = await findSheet(sheets, spreadsheetId, title);
  if (existing) {
    return existing;
  }
  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        },
      ],
    },
  });
  const sheetId = created.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error(`「${title}」シートの作成に失敗しました。`);
  }
  return { sheetId, title };
}

async function parseUsers(values: string[][]): Promise<AppUser[]> {
  const adminPassword = await getAdminPassword();
  if (values.length === 0) {
    return defaultUsers(adminPassword);
  }
  const headers = values[0] ?? [];
  const nameIndex = headers.findIndex((header) => flatten(header) === "ユーザー名");
  const roleIndex = headers.findIndex((header) => flatten(header) === "役割");
  const passwordIndex = headers.findIndex((header) => flatten(header) === "パスワード");
  const users = values.slice(1).flatMap((row) => {
    const name = (row[nameIndex >= 0 ? nameIndex : 0] ?? "").trim();
    if (!name) {
      return [];
    }
    const roleValue = (row[roleIndex >= 0 ? roleIndex : 1] ?? "").trim();
    const password = (row[passwordIndex >= 0 ? passwordIndex : 2] ?? "").trim();
    const isAdmin = name === ADMIN_USER_NAME || isAdminRole(roleValue);
    return [
      {
        name,
        role: isAdmin ? "admin" : "user",
        password: isAdmin ? password || adminPassword : password,
      } satisfies AppUser,
    ];
  });
  return users.length > 0 ? users : defaultUsers(adminPassword);
}

export async function listAppUsers(input: {
  spreadsheetId: string;
  sheetName?: string;
}): Promise<AppUser[]> {
  if (!input.spreadsheetId) {
    return defaultUsers(await getAdminPassword());
  }
  const auth = await createGoogleOAuthClient();
  if (!auth) {
    return defaultUsers(await getAdminPassword());
  }
  const title = input.sheetName?.trim() || DEFAULT_USERS_SHEET_NAME;
  const sheets = sheetsClient(auth);
  try {
    const existing = await findSheet(sheets, input.spreadsheetId, title);
    if (!existing) {
      return defaultUsers(await getAdminPassword());
    }
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: input.spreadsheetId,
      range: `${quotedSheet(existing.title)}!A1:C500`,
    });
    return await parseUsers((response.data.values ?? []) as string[][]);
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "ユーザー一覧の取得に失敗しました。"));
  }
}

export async function saveAppUsers(input: {
  spreadsheetId: string;
  sheetName?: string;
  users: Array<{ name: string; role?: string; password?: string }>;
}): Promise<AppUser[]> {
  const auth = await createGoogleOAuthClient();
  if (!auth) {
    throw new Error("Google認証情報が未設定です。");
  }
  if (!input.spreadsheetId) {
    throw new Error("ユーザー一覧のスプレッドシートIDを設定してください。");
  }
  const normalized = await normalizeUsers(input.users);
  const title = input.sheetName?.trim() || DEFAULT_USERS_SHEET_NAME;
  const sheets = sheetsClient(auth);
  try {
    const sheet = await ensureUsersSheet(sheets, input.spreadsheetId, title);
    await sheets.spreadsheets.values.clear({
      spreadsheetId: input.spreadsheetId,
      range: `${quotedSheet(sheet.title)}!A:C`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: input.spreadsheetId,
      range: `${quotedSheet(sheet.title)}!A1:C${normalized.length + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [...HEADERS],
          ...normalized.map((user) => [
            user.name,
            user.role === "admin" ? "管理者" : "一般",
            user.role === "admin" ? user.password || (await getAdminPassword()) : user.password,
          ]),
        ],
      },
    });
    return normalized;
  } catch (error) {
    throw new Error(toGoogleErrorMessage(error, "ユーザー一覧の保存に失敗しました。"));
  }
}

export async function normalizeUsers(users: Array<{ name: string; role?: string; password?: string }>): Promise<AppUser[]> {
  const adminPassword = await getAdminPassword();
  const seen = new Set<string>();
  const next: AppUser[] = [];
  for (const user of users) {
    const name = user.name.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const isAdmin = name === ADMIN_USER_NAME || user.role === "admin" || isAdminRole(user.role ?? "");
    next.push({
      name,
      role: isAdmin ? "admin" : "user",
      password: isAdmin ? user.password?.trim() || adminPassword : user.password?.trim() ?? "",
    });
  }
  if (!next.some((user) => user.role === "admin")) {
    next.unshift({
      name: ADMIN_USER_NAME,
      role: "admin",
      password: adminPassword,
    });
  }
  return next;
}

export function publicUsers(users: AppUser[]) {
  return users.map(toPublicUser);
}
