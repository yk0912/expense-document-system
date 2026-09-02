import { envVar } from "@/lib/env";

export const DEFAULT_ADMIN_PASSWORD = "admin";

export function getAdminPassword(): string {
  return envVar("ADMIN_PASSWORD") || DEFAULT_ADMIN_PASSWORD;
}
