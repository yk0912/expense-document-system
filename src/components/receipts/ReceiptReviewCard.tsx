"use client";

import {
  applyEntryMode,
  createEmptyReviewItem,
  defaultLumpItemName,
  replaceReceiptItems,
  summarizeReceipt,
} from "@/lib/accounting/analysis-mapper";
import {
  resolveVendorKind,
  usesDiningVendorLabel,
} from "@/lib/accounting/vendor-kind";
import { dateInputValue } from "@/lib/accounting/date";
import { ReceiptItemEditor } from "@/components/receipts/ReceiptItemEditor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PRICE_BASES, STORES, type CategoryMasterItem, type ReviewReceipt } from "@/types/receipt";

const PRICE_LABELS: Record<(typeof PRICE_BASES)[number], string> = {
  tax_included: "税込",
  tax_excluded: "税抜",
  unknown: "未確認",
};

function yen(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString()}円`;
}

function parseYenInput(raw: string): number | null {
  const digits = raw.replace(/[^\d-]/g, "");
  if (digits === "" || digits === "-") {
    return null;
  }
  return Number(digits);
}

function PrintedAmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        inputMode="numeric"
        className="h-11"
        value={value ?? ""}
        onChange={(event) => onChange(parseYenInput(event.target.value))}
      />
    </label>
  );
}

function AmountLine({
  label,
  value,
  compare,
}: {
  label: string;
  value: number | null;
  compare?: number | null;
}) {
  const comparable = compare !== undefined && compare !== null && value !== null;
  const mismatch = comparable && value !== compare;
  return (
    <p className={mismatch ? "text-destructive" : undefined}>
      {label} {yen(value)}
      {comparable ? (
        <span className="ml-2 text-xs">
          {mismatch ? "不一致" : "一致"}
        </span>
      ) : null}
    </p>
  );
}

type ReceiptReviewCardProps = {
  receipt: ReviewReceipt;
  categories: CategoryMasterItem[];
  onChange: (next: ReviewReceipt) => void;
  onRemove?: () => void;
};

export function ReceiptReviewCard({
  receipt,
  categories,
  onChange,
  onRemove,
}: ReceiptReviewCardProps) {
  const update = (patch: Partial<ReviewReceipt>) => {
    onChange(summarizeReceipt({ ...receipt, ...patch }));
  };

  const updateItems = (
    items: ReviewReceipt["items"],
    recalculateTotal = false,
  ) => {
    onChange(replaceReceiptItems(receipt, items, { recalculateTotal }));
  };

  return (
    <Card className="gap-0 overflow-hidden border-[3px] border-primary py-0 ring-0">
      <CardHeader className="items-center rounded-none bg-primary py-3">
        <CardTitle className="text-lg font-semibold text-primary-foreground">
          レシート {receipt.receiptIndex}
        </CardTitle>
        {onRemove ? (
          <CardAction className="self-center">
            <Button
              type="button"
              variant="outline"
              className="h-9 border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={onRemove}
            >
              レシートを削除
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 py-(--card-spacing)">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">取引先</span>
          <Input
            className="h-11"
            value={receipt.vendorName}
            onChange={(event) => {
              const vendorName = event.target.value;
              update({
                vendorName,
                vendorKind: resolveVendorKind(
                  vendorName,
                  receipt.storeAddress,
                  receipt.vendorKind,
                ),
              });
            }}
          />
          {usesDiningVendorLabel(receipt.vendorKind, receipt.vendorName) ? (
            <span className="block text-xs leading-5 text-muted-foreground">
              「飲食店」と表示されます
            </span>
          ) : null}
        </label>

        {receipt.storeAddress ? (
          <p className="text-sm text-muted-foreground">{receipt.storeAddress}</p>
        ) : null}

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">店舗</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={receipt.assignedStore}
            onChange={(event) =>
              update({
                assignedStore: event.target.value as ReviewReceipt["assignedStore"],
              })
            }
          >
            {STORES.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">購入日</span>
          <input
            type="date"
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={dateInputValue(receipt.transactionDate)}
            onChange={(event) =>
              update({ transactionDate: event.target.value || null })
            }
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">計上方法</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={receipt.entryMode}
            onChange={(event) =>
              onChange(
                applyEntryMode(
                  receipt,
                  event.target.value as ReviewReceipt["entryMode"],
                  categories,
                ),
              )
            }
          >
            <option value="lump_sum">まとめて表示</option>
            <option value="line_items">商品ごとに分ける</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">金額表記</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={receipt.priceBasis}
            onChange={(event) =>
              update({
                priceBasis: event.target.value as ReviewReceipt["priceBasis"],
              })
            }
          >
            {PRICE_BASES.map((basis) => (
              <option key={basis} value={basis}>
                {PRICE_LABELS[basis]}
              </option>
            ))}
          </select>
        </label>

        {receipt.entryMode === "lump_sum" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">合計計上</p>
            <p className="text-sm text-muted-foreground">
              商品名は使わず、レシート合計を1件として計上します。経費区分は会議費または交際費などを選んでください。
            </p>
            {receipt.items[0] ? (
              <ReceiptItemEditor
                item={receipt.items[0]}
                categories={categories}
                lumpSum
                namePlaceholder={defaultLumpItemName(receipt.vendorKind)}
                onChange={(nextItem) => update({ items: [nextItem] })}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => {
                const baseItems =
                  receipt.extractedItems.length > 0
                    ? receipt.extractedItems
                    : [];
                onChange(
                  replaceReceiptItems(
                    { ...receipt, entryMode: "line_items" },
                    [...baseItems, createEmptyReviewItem()],
                    { recalculateTotal: true },
                  ),
                );
              }}
            >
              商品を追加
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">明細</p>
            {receipt.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                商品がありません。読み取れなかった商品を追加してください。
              </p>
            ) : null}
            {receipt.items.map((item) => (
              <ReceiptItemEditor
                key={item.clientId}
                item={item}
                categories={categories}
                onChange={(nextItem) =>
                  updateItems(
                    receipt.items.map((current) =>
                      current.clientId === nextItem.clientId ? nextItem : current,
                    ),
                    nextItem.amount !== item.amount,
                  )
                }
                onRemove={() =>
                  updateItems(
                    receipt.items.filter(
                      (current) => current.clientId !== item.clientId,
                    ),
                    true,
                  )
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() =>
                updateItems([...receipt.items, createEmptyReviewItem()], true)
              }
            >
              商品を追加
            </Button>
          </div>
        )}

        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <div>
              <p className="font-medium">レシート記載</p>
              <p className="text-xs text-muted-foreground">
                読み取りが違う場合は修正してください
              </p>
            </div>
            <PrintedAmountField
              label="小計（税抜・円）"
              value={receipt.extractedSubtotalAmount}
              onChange={(value) => update({ extractedSubtotalAmount: value })}
            />
            <PrintedAmountField
              label="消費税8%対象合計（円）"
              value={receipt.extractedTaxableAmount8}
              onChange={(value) => update({ extractedTaxableAmount8: value })}
            />
            <PrintedAmountField
              label="消費税 8%（円）"
              value={receipt.extractedTaxAmount8}
              onChange={(value) => update({ extractedTaxAmount8: value })}
            />
            <PrintedAmountField
              label="消費税10%対象合計（円）"
              value={receipt.extractedTaxableAmount10}
              onChange={(value) => update({ extractedTaxableAmount10: value })}
            />
            <PrintedAmountField
              label="消費税 10%（円）"
              value={receipt.extractedTaxAmount10}
              onChange={(value) => update({ extractedTaxAmount10: value })}
            />
            <PrintedAmountField
              label="レシート合計（税込・円）"
              value={receipt.extractedTotalAmount}
              onChange={(value) =>
                update({ extractedTotalAmount: value, totalAmount: value })
              }
            />
          </div>
          {receipt.entryMode === "line_items" ? (
            <div className="space-y-1">
              <p className="font-medium">各商品から計算</p>
              <p>各商品の税抜合計 {yen(receipt.lineTotal)}</p>
              <AmountLine
                label="8%対象合計"
                value={receipt.itemTaxableAmount8}
                compare={receipt.taxableAmount8}
              />
              <AmountLine
                label="消費税 8%"
                value={receipt.itemTaxAmount8}
                compare={receipt.taxAmount8}
              />
              <AmountLine
                label="10%対象合計"
                value={receipt.itemTaxableAmount10}
                compare={receipt.taxableAmount10}
              />
              <AmountLine
                label="消費税 10%"
                value={receipt.itemTaxAmount10}
                compare={receipt.taxAmount10}
              />
            </div>
          ) : null}
        </div>

        {receipt.warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-destructive">
            {receipt.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
