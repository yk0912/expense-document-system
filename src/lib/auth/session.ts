import { SESSION_COOKIE, type SessionUser } from "@/lib/auth/constants";
import { envVar } from "@/lib/env";

const encoder = new TextEncoder();

function sessionSecret(): string {
  return envVar("GOOGLE_CLIENT_SECRET") || "expense-document-system-session";
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(signature);
}

export async function encodeSession(user: SessionUser): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        n: user.name,
        a: user.isAdmin ? 1 : 0,
        e: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
    ),
  );
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

export async function decodeSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = await hmac(payload);
  if (expected.length !== signature.length) {
    return null;
  }
  let same = 0;
  for (let index = 0; index < expected.length; index += 1) {
    same |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  if (same !== 0) {
    return null;
  }
  try {
    const json = new TextDecoder().decode(fromBase64Url(payload));
    const parsed = JSON.parse(json) as { n?: string; a?: number; e?: number };
    if (!parsed.n || typeof parsed.e !== "number" || parsed.e < Date.now()) {
      return null;
    }
    return { name: parsed.n, isAdmin: parsed.a === 1 };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
}

export { SESSION_COOKIE };

export function passwordsMatch(submitted: string, expected: string): boolean {
  const left = submitted.normalize();
  const right = expected.normalize();
  if (left.length !== right.length) {
    return false;
  }
  let same = 0;
  for (let index = 0; index < left.length; index += 1) {
    same |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return same === 0;
}
