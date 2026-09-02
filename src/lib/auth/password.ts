import { loadServerEnv } from "@/lib/env";

export const DEFAULT_ADMIN_PASSWORD = "admin";

export async function getAdminPassword(): Promise<string> {
  const env = await loadServerEnv();
  return env.adminPassword || DEFAULT_ADMIN_PASSWORD;
}
