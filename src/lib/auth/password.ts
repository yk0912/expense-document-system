import { loadServerEnv } from "@/lib/env";

export const DEFAULT_ADMIN_PASSWORD = "admin";

export function getAdminPassword(): string {
  return loadServerEnv().adminPassword || DEFAULT_ADMIN_PASSWORD;
}
