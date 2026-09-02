"use client";

import { applyEntryMode, summarizeReceipt } from "@/lib/accounting/analysis-mapper";
import {
  resolveVendorKind,
  usesDiningVendorLabel,
} from "@/lib/accounting/vendor-kind";
import { dateInputValue } from "@/lib/accounting/date";
import { ReceiptItemEditor } from "@/components/receipts/ReceiptItemEditor";
import {
  Card,
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

type ReceiptReviewCardProps = {
  receipt: ReviewReceipt;
  categories: CategoryMasterItem[];
  onChange: (next: ReviewReceipt) => void;
};

export function ReceiptReviewCard({
  receipt,
  categories,
  onChange,
}: ReceiptReviewCardProps) {
  const update = (patch: Partial<ReviewReceipt>) => {
    onChange(summarizeReceipt({ ...receipt, ...patch }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>レシート {receipt.receiptIndex}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <option value="lump_sum">合計で計上（会議費・交際費）</option>
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
              飲食店の領収書・レシートはメニューごとの区分は不要です。会議費または交際費で合計を計上します。
            </p>
            {receipt.items[0] ? (
              <ReceiptItemEditor
                item={receipt.items[0]}
                categories={categories}
                lumpSum
                onChange={(nextItem) => update({ items: [nextItem] })}
              />
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">明細</p>
            {receipt.items.map((item) => (
              <ReceiptItemEditor
                key={item.clientId}
                item={item}
                categories={categories}
                onChange={(nextItem) =>
                  update({
                    items: receipt.items.map((current) =>
                      current.clientId === nextItem.clientId ? nextItem : current,
                    ),
                  })
                }
              />
            ))}
          </div>
        )}

        <div className="space-y-1 text-sm">
          <p>レシート合計 {receipt.totalAmount?.toLocaleString() ?? "—"}円</p>
          {receipt.entryMode === "line_items" ? (
            <p>明細合計 {receipt.lineTotal?.toLocaleString() ?? "—"}円</p>
          ) : null}
        </div>

        {receipt.taxReconciledRate ? (
          <p className="text-sm text-muted-foreground">
            明細は税抜、レシート合計は税込です。消費税{receipt.taxReconciledRate}%を加味すると一致します。
          </p>
        ) : null}

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
