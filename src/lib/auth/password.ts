export const DEFAULT_ADMIN_PASSWORD = "admin";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
}
