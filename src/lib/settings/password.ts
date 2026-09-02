import { timingSafeEqual } from "node:crypto";

export function verifySystemPassword(password: string): boolean {
  const expected = process.env.SYSTEM_SETTINGS_PASSWORD?.trim();
  if (!expected) {
    return true;
  }
  const submitted = password.normalize();
  const left = Buffer.from(submitted);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function systemPasswordConfigured(): boolean {
  return Boolean(process.env.SYSTEM_SETTINGS_PASSWORD?.trim());
}
