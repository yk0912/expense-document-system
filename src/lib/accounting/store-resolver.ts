import { STORES, type Store } from "@/types/receipt";

const MITTEN_PATTERN = /ミッテン|mitten/i;

export function resolveStore(
  storeName: string | null,
  storeAddress: string | null,
): Store {
  const haystack = `${storeName ?? ""} ${storeAddress ?? ""}`;

  if (MITTEN_PATTERN.test(haystack)) {
    return "ミッテン";
  }
  if (haystack.includes("武蔵野店") || haystack.includes("武蔵野市")) {
    return "武蔵野店";
  }
  if (haystack.includes("府中店") || haystack.includes("府中市")) {
    return "府中店";
  }
  if (haystack.includes("武蔵野")) {
    return "武蔵野店";
  }
  return "運営";
}

export function isStore(value: string): value is Store {
  return (STORES as readonly string[]).includes(value);
}
