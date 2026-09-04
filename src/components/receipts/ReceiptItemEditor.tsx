"use client";

import { Input } from "@/components/ui/input";
import type { CategoryMasterItem, ReviewItem } from "@/types/receipt";

type ReceiptItemEditorProps = {
  item: ReviewItem;
  categories: CategoryMasterItem[];
  lumpSum?: boolean;
  namePlaceholder?: string;
  onChange: (next: ReviewItem) => void;
};

export function ReceiptItemEditor({
  item,
  categories,
  lumpSum = false,
  namePlaceholder,
  onChange,
}: ReceiptItemEditorProps) {
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
    </div>
  );
}
