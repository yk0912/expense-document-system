"use client";

import { useEffect } from "react";

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
import { itemTaxPercent, printedInclusiveFromGroups } from "@/lib/accounting/amount-check";
import { missingItemSettings } from "@/lib/accounting/registration";
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
      className="h-8 w-full min-w-0 px-1.5 text-sm tabular-nums"
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

  useEffect(() => {
    const next = summarizeReceipt(receipt);
    if (
      next.taxKind8 !== receipt.taxKind8 ||
      next.taxKind10 !== receipt.taxKind10 ||
      next.itemInclusiveTotal !== receipt.itemInclusiveTotal ||
      next.itemTaxAmount8 !== receipt.itemTaxAmount8 ||
      next.itemTaxAmount10 !== receipt.itemTaxAmount10
    ) {
      onChange(next);
    }
    // 既存の読み取り結果を、印字額からの内税/外税推論で一度だけ補正する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.clientId]);

  const updateItems = (items: ReviewReceipt["items"]) => {
    onChange(replaceReceiptItems(receipt, items));
  };

  const printedTaxSum = printedInclusiveFromGroups({
    subtotal: receipt.extractedSubtotalAmount,
    taxable8: receipt.extractedTaxableAmount8,
    taxable10: receipt.extractedTaxableAmount10,
    tax8: receipt.extractedTaxAmount8,
    tax10: receipt.extractedTaxAmount10,
    taxKind8: receipt.taxKind8,
    taxKind10: receipt.taxKind10,
  });
  const itemInclusive = receipt.itemInclusiveTotal;
  const showItemCalc = receipt.entryMode === "line_items";
  const incompleteItemCount = receipt.items.filter(
    (item) =>
      missingItemSettings(item, {
        lumpSum: receipt.entryMode === "lump_sum",
      }).length > 0,
  ).length;

  const setRateTaxKind = (rate: 8 | 10, taxKind: TaxKind | null) => {
    const patch =
      rate === 8
        ? { taxKind8: taxKind, taxKind8Locked: taxKind !== null }
        : { taxKind10: taxKind, taxKind10Locked: taxKind !== null };
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
            {incompleteItemCount > 0 ? (
              <p className="rounded-md bg-destructive px-2.5 py-1.5 text-sm font-semibold text-destructive-foreground">
                設定してください（未設定の項目があります）
              </p>
            ) : null}
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
            {incompleteItemCount > 0 ? (
              <p className="rounded-md bg-destructive px-2.5 py-1.5 text-sm font-semibold text-destructive-foreground">
                設定してください（{incompleteItemCount}件）
              </p>
            ) : null}
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
                  )
                }
                onRemove={() =>
                  updateItems(
                    receipt.items.filter(
                      (current) => current.clientId !== item.clientId,
                    ),
                  )
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() =>
                updateItems([...receipt.items, createEmptyReviewItem()])
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
              内税の税込再計は対象額そのものです。外税は対象額に、税率ごとの消費税（切り捨て）を足します
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
          <div>
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col className="w-14" />
                {showItemCalc ? <col className="w-[4.25rem]" /> : null}
                {showItemCalc ? <col className="w-10" /> : null}
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-1 font-medium">項目</th>
                  <th className="py-1.5 pr-1 font-medium">レシート</th>
                  {showItemCalc ? (
                    <th className="py-1.5 pr-1 font-medium">商品計算</th>
                  ) : null}
                  {showItemCalc ? (
                    <th className="py-1.5 font-medium">照合</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/70">
                  <td className="py-1.5 pr-1">小計（税抜）</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedSubtotalAmount}
                      onChange={(value) =>
                        update({ extractedSubtotalAmount: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">{yen(receipt.lineTotal)}</td>
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
                  <td className="py-1.5 pr-1">8%対象合計</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedTaxableAmount8}
                      onChange={(value) =>
                        update({ extractedTaxableAmount8: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">
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
                  <td className="py-1.5 pr-1">消費税8%</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedTaxAmount8}
                      onChange={(value) => update({ extractedTaxAmount8: value })}
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">
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
                  <td className="py-1.5 pr-1">10%対象合計</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedTaxableAmount10}
                      onChange={(value) =>
                        update({ extractedTaxableAmount10: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">
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
                  <td className="py-1.5 pr-1">消費税10%</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedTaxAmount10}
                      onChange={(value) =>
                        update({ extractedTaxAmount10: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">
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
                  <td className="py-1.5 pr-1">税込再計</td>
                  <td className="py-1.5 pr-1 tabular-nums">{yen(printedTaxSum)}</td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">{yen(itemInclusive)}</td>
                  ) : null}
                  {showItemCalc ? (
                    <td className="py-1.5">
                      <MatchCell printed={printedTaxSum} calculated={itemInclusive} />
                    </td>
                  ) : null}
                </tr>
                <tr>
                  <td className="py-1.5 pr-1">合計（税込）</td>
                  <td className="py-1.5 pr-1">
                    <CompactYenInput
                      value={receipt.extractedTotalAmount}
                      onChange={(value) =>
                        update({ extractedTotalAmount: value, totalAmount: value })
                      }
                    />
                  </td>
                  {showItemCalc ? (
                    <td className="py-1.5 pr-1 tabular-nums">{yen(itemInclusive)}</td>
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
