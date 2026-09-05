"use client";

import { useState } from "react";

import { defaultTaxRateForCategory } from "@/lib/accounting/amount-check";
import { missingItemSettings } from "@/lib/accounting/registration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  const missing = missingItemSettings(item, { lumpSum });
  const needsName = !item.name.trim();
  const needsAmount = item.amount === null;
  const needsCategory = !item.category;
  const needsTaxRate = !lumpSum && item.taxRate === null;
  const needsTaxKind = missing.includes("内税/外税");

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-3",
        missing.length > 0
          ? "border-destructive bg-destructive/5"
          : "border-border",
      )}
    >
      {missing.length > 0 ? (
        <p className="rounded-md bg-destructive px-2.5 py-1.5 text-sm font-semibold text-destructive-foreground">
          設定してください：{missing.join("、")}
        </p>
      ) : null}
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">
          {lumpSum ? "内容" : "商品名"}
        </span>
        <Input
          value={item.name}
          placeholder={namePlaceholder ?? (lumpSum ? "合計" : "商品名")}
          className="h-11"
          aria-invalid={needsName}
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
            aria-invalid={needsAmount}
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
            className={cn(
              "h-11 w-full rounded-lg border bg-background px-2.5 text-base",
              needsCategory
                ? "border-destructive ring-3 ring-destructive/20"
                : "border-input",
            )}
            value={item.category ?? ""}
            aria-invalid={needsCategory}
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
              className={cn(
                "h-11 w-full rounded-lg border bg-background px-2.5 text-base",
                needsTaxRate
                  ? "border-destructive ring-3 ring-destructive/20"
                  : "border-input",
              )}
              value={item.taxRate ?? 0}
              aria-invalid={needsTaxRate}
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
              className={cn(
                "h-11 w-full rounded-lg border bg-background px-2.5 text-base",
                needsTaxKind
                  ? "border-destructive ring-3 ring-destructive/20"
                  : "border-input",
              )}
              value={item.taxKind ?? ""}
              aria-invalid={needsTaxKind}
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
      {missing.length > 0 && lumpSum && missing.includes("区分") ? (
        <p className="text-sm text-destructive">
          会議費または交際費を選んでください。
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
