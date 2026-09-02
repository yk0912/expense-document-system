export const ADMIN_USER_NAME = "管理者";
export const SESSION_COOKIE = "expense_session";
export const DEFAULT_USERS_SHEET_NAME = "ユーザー";

export type SessionUser = {
  name: string;
  isAdmin: boolean;
};

export type AppUser = {
  name: string;
  role: "admin" | "user";
  password: string;
};

