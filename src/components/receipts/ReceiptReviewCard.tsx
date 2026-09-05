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
import { itemTaxPercent } from "@/lib/accounting/amount-check";
import {
  PRICE_BASES,
  STORES,
  type CategoryMasterItem,
  type ReviewReceipt,
  type TaxKind,
} from "@/types/receipt";

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

function addAmounts(...values: Array<number | null>): number | null {
  if (values.every((value) => value === null)) {
    return null;
  }
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function CompactYenInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Input
      inputMode="numeric"
      className="h-9 min-w-20 tabular-nums"
      value={value ?? ""}
      onChange={(event) => onChange(parseYenInput(event.target.value))}
    />
  );
}

function MatchCell({
  printed,
  calculated,
}: {
  printed: number | null;
  calculated: number | null;
}) {
  if (printed === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (calculated === null || printed !== calculated) {
    return <span className="font-medium text-destructive">不一致</span>;
  }
  return <span className="text-muted-foreground">一致</span>;
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

  const printedTaxSum =
    receipt.extractedSubtotalAmount === null ||
    (receipt.extractedTaxAmount8 === null && receipt.extractedTaxAmount10 === null)
      ? null
      : addAmounts(
          receipt.extractedSubtotalAmount,
          receipt.extractedTaxAmount8,
          receipt.extractedTaxAmount10,
        );
  const itemInclusive = receipt.itemInclusiveTotal;
  const showItemCalc = receipt.entryMode === "line_items";

  const setRateTaxKind = (rate: 8 | 10, taxKind: TaxKind | null) => {
    const patch =
      rate === 8 ? { taxKind8: taxKind } : { taxKind10: taxKind };
    onChange(
      summarizeReceipt({
        ...receipt,
        ...patch,
        items: receipt.items.map((item) =>
          itemTaxPercent(item.taxRate) === rate ? { ...item, taxKind } : item,
        ),
      }),
    );
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
                defaultTaxKind8={receipt.taxKind8}
                defaultTaxKind10={receipt.taxKind10}
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
                defaultTaxKind8={receipt.taxKind8}
                defaultTaxKind10={receipt.taxKind10}
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

        <div className="space-y-2">
          <div>
            <p className="font-medium">金額の照合</p>
            <p className="text-xs text-muted-foreground">
              レシートに「内10%」とあれば内税、「外10%」とあれば外税です。読み取りが違う場合は修正してください
            </p>
          </div>
          {showItemCalc ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">8% 内税 / 外税</span>
                <select
                  className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                  value={receipt.taxKind8 ?? ""}
                  onChange={(event) =>
                    setRateTaxKind(
                      8,
                      (event.target.value || null) as TaxKind | null,
                    )
                  }
                >
                  <option value="">未設定</option>
                  <option value="included">内税</option>
                  <option value="excluded">外税</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">10% 内税 / 外税</span>
                <select
                  className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                  value={receipt.taxKind10 ?? ""}
                  onChange={(event) =>
                    setRateTaxKind(
                      10,
                      (event.target.value || null) as TaxKind | null,
                    )
                  }
                >
                  <option value="">未設定</option>
                  <option value="included">内税</option>
                  <option value="excluded">外税</option>
                </select>
              </label>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">項目</th>
                  <th className="py-1.5 pr-2 font-medium">レシート</th>
                  {showItemCalc ? (
                    <th className="py-1.5 pr-2 font-medium">商品計算</th>
                  ) : null}
                  {showItemCalc ? (
                    <th className="py-1.5 font-medium">照合</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">小計（税抜）</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedSubtotalAmount}
                      onChange={(value) =>
                        update({ extractedSubtotalAmount: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">{yen(receipt.lineTotal)}</td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedSubtotalAmount}
                        calculated={receipt.lineTotal}
                      />
                    </td>
                  ) : null}
                </tr>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">8%対象合計</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedTaxableAmount8}
                      onChange={(value) =>
                        update({ extractedTaxableAmount8: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">
                      {yen(receipt.itemTaxableAmount8)}
                    </td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedTaxableAmount8}
                        calculated={receipt.itemTaxableAmount8}
                      />
                    </td>
                  ) : null}
                </tr>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">消費税8%</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedTaxAmount8}
                      onChange={(value) => update({ extractedTaxAmount8: value })}
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">
                      {yen(receipt.itemTaxAmount8)}
                    </td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedTaxAmount8}
                        calculated={receipt.itemTaxAmount8}
                      />
                    </td>
                  ) : null}
                </tr>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">10%対象合計</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedTaxableAmount10}
                      onChange={(value) =>
                        update({ extractedTaxableAmount10: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">
                      {yen(receipt.itemTaxableAmount10)}
                    </td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedTaxableAmount10}
                        calculated={receipt.itemTaxableAmount10}
                      />
                    </td>
                  ) : null}
                </tr>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">消費税10%</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedTaxAmount10}
                      onChange={(value) =>
                        update({ extractedTaxAmount10: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">
                      {yen(receipt.itemTaxAmount10)}
                    </td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedTaxAmount10}
                        calculated={receipt.itemTaxAmount10}
                      />
                    </td>
                  ) : null}
                </tr>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-2">小計＋消費税</td>
                  <td className="py-1.5 pr-2 tabular-nums">{yen(printedTaxSum)}</td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">{yen(itemInclusive)}</td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell printed={printedTaxSum} calculated={itemInclusive} />
                    </td>
                  ) : null}
                </tr>
                <tr>
                  <td className="py-1.5 pr-2">合計（税込）</td>
                  <td className="py-1.5 pr-2">
                    <CompactYenInput
                      value={receipt.extractedTotalAmount}
                      onChange={(value) =>
                        update({ extractedTotalAmount: value, totalAmount: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-2 tabular-nums">{yen(itemInclusive)}</td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell
                        printed={receipt.extractedTotalAmount}
                        calculated={itemInclusive}
                      />
                    </td>
                  ) : null}
                </tr>
              </tbody>
            </table>
          </div>
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
