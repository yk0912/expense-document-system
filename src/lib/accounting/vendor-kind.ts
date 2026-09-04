import type { CategoryMasterItem, EntryMode, VendorKind } from "@/types/receipt";
import { matchCategoryName } from "@/lib/accounting/category-column";

const RETAIL_PATTERN =
  /スーパー|コンビニ|ドラッグストア|薬局|ホームセンター|100円|百均|ディスカウント|業務スーパー|サミット|ライフ|いなげや|イオン|オーケー|マルエツ|西友|成城石井|セブン|ローソン|ファミマ|ファミリーマート|ミニストップ|デイリーヤマザキ|マツモトキヨシ|ウエルシア|スギ薬局|カワチ|ツルハ|ダイソー|セリア|キャンドゥ|ロフト|ハンズ|無印|ドン[・･]?キ|コストコ/;

const DINING_PATTERN =
  /居酒屋|レストラン|ファミレス|食堂|定食|カフェ|喫茶|珈琲|コーヒー|焼肉|寿司|すし|ラーメン|うどん|そば|丼|バー|酒場|ダイニング|ビストロ|パティスリー|洋菓子|ケーキ|パン屋|ベーカリー|飲食|御飲食代|ご飲食|食事代|サイゼリヤ|ガスト|ジョナサン|デニーズ|オリーブの丘|目利き|銀次|ル[・･]?ジャルダン|スターバックス|ドトール|タリーズ|コメダ|大戸屋|やよい軒|すき家|松屋|吉野家/;

export const DINING_VENDOR_LABEL = "飲食店";

const DINING_CATEGORY_HINTS = [
  "会議費",
  "交際費",
  "接待交際費",
  "会議交際費",
  "接待費",
  "飲食費",
];

export function resolveVendorKind(
  storeName: string | null,
  storeAddress: string | null,
  hintedKind: VendorKind | null,
): VendorKind {
  const haystack = `${storeName ?? ""} ${storeAddress ?? ""}`;

  if (RETAIL_PATTERN.test(haystack)) {
    return "retail";
  }
  if (DINING_PATTERN.test(haystack) || haystack.includes("御飲食代")) {
    return "dining";
  }
  if (hintedKind && hintedKind !== "unknown") {
    return hintedKind;
  }
  return "unknown";
}

export function usesDiningVendorLabel(
  vendorKind: VendorKind,
  vendorName?: string | null,
): boolean {
  if (vendorKind === "dining") {
    return true;
  }
  return DINING_PATTERN.test(vendorName ?? "");
}

export function toSheetVendorName(
  vendorKind: VendorKind,
  vendorName: string,
): string {
  return usesDiningVendorLabel(vendorKind, vendorName)
    ? DINING_VENDOR_LABEL
    : vendorName;
}

export function resolveEntryMode(
  _vendorKind: VendorKind,
  _hasUsableLineItems: boolean,
  _totalAmount: number | null,
): EntryMode {
  return "lump_sum";
}

export function suggestDiningCategory(
  categories: CategoryMasterItem[],
  hintedName: string | null,
): string | null {
  const names = categories.map((category) => category.name);

  if (hintedName) {
    const mapped = matchCategoryName(hintedName, names);
    if (mapped) {
      return mapped;
    }
  }

  for (const hint of DINING_CATEGORY_HINTS) {
    const mapped = matchCategoryName(hint, names);
    if (mapped) {
      return mapped;
    }
  }

  const partial = categories.find((category) => {
    const text = `${category.name}${category.examples ?? ""}${category.description ?? ""}`;
    return /会議|交際|接待|飲食/.test(text) && !/贈答|手土産|慶弔|香典|祝儀/.test(text);
  });
  return partial?.name ?? null;
}

export function hasUsableLineItems(
  items: Array<{ amount: number | null; name?: string | null }>,
): boolean {
  return items.some(
    (item) => item.amount !== null && item.amount !== 0 && Boolean(item.name?.trim()),
  );
}
