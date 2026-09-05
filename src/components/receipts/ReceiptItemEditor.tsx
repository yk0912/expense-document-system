"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryMasterItem, ReviewItem } from "@/types/receipt";

type ReceiptItemEditorProps = {
  item: ReviewItem;
  categories: CategoryMasterItem[];
  lumpSum?: boolean;
  namePlaceholder?: string;
  onChange: (next: ReviewItem) => void;
  onRemove?: () => void;
};

export function ReceiptItemEditor({
  item,
  categories,
  lumpSum = false,
  namePlaceholder,
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
          <span className="text-xs text-muted-foreground">金額（円）</span>
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
            onChange={(event) =>
              onChange({
                ...item,
                category: event.target.value || null,
                requiresReview: event.target.value === "",
              })
            }
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
