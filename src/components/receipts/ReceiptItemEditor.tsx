"use client";

import { useState } from "react";

import { defaultTaxRateForCategory } from "@/lib/accounting/amount-check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ITEM_TAX_RATES,
  type CategoryMasterItem,
  type ItemTaxRate,
  type ReviewItem,
  type TaxKind,
} from "@/types/receipt";

type ReceiptItemEditorProps = {
  item: ReviewItem;
  categories: CategoryMasterItem[];
  lumpSum?: boolean;
  namePlaceholder?: string;
  defaultTaxKind8?: TaxKind | null;
  defaultTaxKind10?: TaxKind | null;
  onChange: (next: ReviewItem) => void;
  onRemove?: () => void;
};

export function ReceiptItemEditor({
  item,
  categories,
  lumpSum = false,
  namePlaceholder,
  defaultTaxKind8 = null,
  defaultTaxKind10 = null,
  onChange,
  onRemove,
}: ReceiptItemEditorProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          {lumpSum ? "内容" : "商品名"}
        </span>
        <Input
          value={item.name}
          placeholder={namePlaceholder ?? (lumpSum ? "合計" : "商品名")}
          className="h-11"
          onChange={(event) =>
            onChange({ ...item, name: event.target.value, requiresReview: false })
          }
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {lumpSum ? "金額（円）" : "金額（円）"}
          </span>
          <Input
            inputMode="numeric"
            className="h-11"
            value={item.amount ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              onChange({
                ...item,
                amount: raw === "" ? null : Number(raw.replace(/[^\d-]/g, "")),
              });
            }}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">経費区分</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
            value={item.category ?? ""}
            onChange={(event) => {
              const category = event.target.value || null;
              const taxRate = defaultTaxRateForCategory(category, categories);
              onChange({
                ...item,
                category,
                taxRate,
                taxKind:
                  taxRate === 8
                    ? (item.taxKind ?? defaultTaxKind8)
                    : taxRate === 10
                      ? (item.taxKind ?? defaultTaxKind10)
                      : item.taxKind,
                requiresReview: event.target.value === "",
              });
            }}
          >
            <option value="">選択してください</option>
            {categories.map((category) => (
              <option key={category.name} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lumpSum ? null : (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">消費税率</span>
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
              value={item.taxRate ?? 0}
              onChange={(event) => {
                const taxRate = Number(event.target.value) as ItemTaxRate;
                const taxKind =
                  taxRate === 8
                    ? (item.taxKind ?? defaultTaxKind8)
                    : taxRate === 10
                      ? (item.taxKind ?? defaultTaxKind10)
                      : item.taxKind;
                onChange({
                  ...item,
                  taxRate,
                  taxKind,
                });
              }}
            >
              {ITEM_TAX_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">内税 / 外税</span>
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base"
              value={item.taxKind ?? ""}
              onChange={(event) =>
                onChange({
                  ...item,
                  taxKind: (event.target.value || null) as TaxKind | null,
                })
              }
            >
              <option value="">未設定</option>
              <option value="included">内税</option>
              <option value="excluded">外税</option>
            </select>
          </label>
        </div>
      )}
      {item.requiresReview || !item.category ? (
        <p className="text-sm text-destructive">
          {lumpSum
            ? "会議費または交際費を選んでください。"
            : "AIが区分を判断できませんでした。選択してください。"}
        </p>
      ) : null}
      {onRemove ? (
        confirmingRemove ? (
          <div className="space-y-2 rounded-md bg-destructive/10 p-2">
            <p className="text-sm">この商品を削除しますか？</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                className="h-8 flex-1 text-sm"
                onClick={onRemove}
              >
                削除する
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 flex-1 text-sm"
                onClick={() => setConfirmingRemove(false)}
              >
                やめる
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              className="h-8 px-3 text-xs"
              onClick={() => setConfirmingRemove(true)}
            >
              削除
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
