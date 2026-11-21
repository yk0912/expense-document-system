"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dayNeedsReview,
  dayReviewNotices,
  attendanceTotals,
  emptyAttendanceDay,
  monthLength,
  updateAttendanceDay,
} from "@/lib/attendance/model";
import { formatHours } from "@/lib/attendance/hours";
import { cn } from "@/lib/utils";
import type { AttendanceDay, ReviewAttendance } from "@/types/attendance";

type AttendanceReviewCardProps = {
  sheet: ReviewAttendance;
  names: string[];
  onChange: (next: ReviewAttendance) => void;
  onRemove?: () => void;
};

function clockValue(value: string | null): string {
  return value ?? "";
}

const ATTENDANCE_YEAR_MIN = 2026;
const ATTENDANCE_YEAR_MAX = 2030;

function attendanceYearOptions(year: number | null): number[] {
  const options: number[] = [];
  for (let value = ATTENDANCE_YEAR_MIN; value <= ATTENDANCE_YEAR_MAX; value += 1) {
    options.push(value);
  }
  if (year != null && Number.isInteger(year) && !options.includes(year)) {
    options.push(year);
    options.sort((left, right) => left - right);
  }
  return options;
}

function DecimalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    const textMatchesValue =
      (text === "" && value == null) ||
      (text !== "" && value != null && Number(text) === value);
    if (!textMatchesValue) {
      setText(value == null ? "" : String(value));
    }
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="h-11"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) {
            return;
          }
          setText(raw);
          if (raw === "" || raw === ".") {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
      />
    </label>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  const options: Array<{ label: string; value: boolean | null }> = [
    { label: "あり", value: true },
    { label: "なし", value: false },
    { label: "不明", value: null },
  ];
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              className={`h-10 rounded-lg border text-sm ${
                selected
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground"
              }`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DayEditor({
  day,
  month,
  onChange,
}: {
  day: AttendanceDay;
  month: number | null;
  onChange: (next: AttendanceDay) => void;
}) {
  const label = `${month ?? ""}月${day.day}日`;
  const needsReview = dayNeedsReview(day);
  const changeTime = (patch: Partial<AttendanceDay>) => {
    onChange(updateAttendanceDay(day, patch, true));
  };

  if (day.cleared) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{label}</p>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => onChange({ ...day, cleared: false })}
          >
            戻す
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">この日は転記時に空欄にします。</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3",
        needsReview ? "border-destructive bg-destructive/10" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          className="h-9 text-destructive"
          onClick={() => onChange({ ...day, cleared: true })}
        >
          この日をクリア
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">勤務開始</span>
          <Input
            className="h-11"
            type="time"
            value={clockValue(day.workStart)}
            onChange={(event) =>
              changeTime({ workStart: event.target.value || null })
            }
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">勤務終了</span>
          <Input
            className="h-11"
            type="time"
            value={clockValue(day.workEnd)}
            onChange={(event) => changeTime({ workEnd: event.target.value || null })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">休憩開始</span>
          <Input
            className="h-11"
            type="time"
            value={clockValue(day.breakStart)}
            onChange={(event) =>
              changeTime({ breakStart: event.target.value || null })
            }
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">休憩終了</span>
          <Input
            className="h-11"
            type="time"
            value={clockValue(day.breakEnd)}
            onChange={(event) => changeTime({ breakEnd: event.target.value || null })}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DecimalField
          label="実働時間"
          value={day.actualHours}
          onChange={(actualHours) => onChange(updateAttendanceDay(day, { actualHours }))}
        />
        <DecimalField
          label="早朝深夜（22時〜5時）"
          value={day.earlyHours}
          onChange={(earlyHours) => onChange(updateAttendanceDay(day, { earlyHours }))}
        />
      </div>
      <DecimalField
        label="交通費（円）"
        value={day.transportYen}
        onChange={(transportYen) => onChange(updateAttendanceDay(day, { transportYen }))}
      />
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">備考</span>
        <Input
          className="h-11"
          value={day.note ?? ""}
          onChange={(event) =>
            onChange(updateAttendanceDay(day, { note: event.target.value || null }))
          }
        />
      </label>
      <TriState
        label="責任者サイン"
        value={day.supervisorSigned}
        onChange={(supervisorSigned) =>
          onChange(updateAttendanceDay(day, { supervisorSigned }))
        }
      />
      <TriState
        label="残業承認"
        value={day.overtimeApproved}
        onChange={(overtimeApproved) =>
          onChange(updateAttendanceDay(day, { overtimeApproved }))
        }
      />
      {day.warnings.map((warning) => (
        <p key={warning} className="text-sm text-destructive">
          {warning}
        </p>
      ))}
    </div>
  );
}

export function AttendanceReviewCard({
  sheet,
  names,
  onChange,
  onRemove,
}: AttendanceReviewCardProps) {
  const totals = attendanceTotals(sheet.days, sheet.year, sheet.month);
  const reviewNotices = sheet.days.flatMap((day) => dayReviewNotices(day, sheet.month));
  const usedDays = new Set(sheet.days.map((day) => day.day));
  const openDays = Array.from({ length: monthLength(sheet) }, (_, index) => index + 1).filter(
    (day) => !usedDays.has(day),
  );
  const listId = `attendance-names-${sheet.clientId}`;

  const replaceDay = (next: AttendanceDay) => {
    onChange({
      ...sheet,
      days: sheet.days.map((day) => (day.day === next.day ? next : day)),
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">勤務表 {sheet.sheetIndex}</p>
        {sheet.headerNote ? (
          <p className="text-sm text-muted-foreground">メモ: {sheet.headerNote}</p>
        ) : null}
      </header>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">氏名</span>
        <Input
          className="h-11"
          list={listId}
          value={sheet.employeeName}
          onChange={(event) => onChange({ ...sheet, employeeName: event.target.value })}
        />
        <datalist id={listId}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">年</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base"
            value={sheet.year ?? ""}
            onChange={(event) =>
              onChange({
                ...sheet,
                year: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">選択</option>
            {attendanceYearOptions(sheet.year).map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">月</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base"
            value={sheet.month ?? ""}
            onChange={(event) =>
              onChange({
                ...sheet,
                month: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">選択</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {month}月
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
        <p>総勤務数 {totals.workDayCount}日</p>
        <p>総実働 {formatHours(totals.totalHours)}時間</p>
        <p className="col-span-2">
          土日祝の総勤務時間{" "}
          {totals.weekendHolidayHours == null
            ? "—"
            : `${formatHours(totals.weekendHolidayHours)}時間`}
        </p>
        <p className="col-span-2">
          交通費合計 {totals.transportYen.toLocaleString("ja-JP")}円
        </p>
        {reviewNotices.map((notice) => (
          <p key={notice} className="col-span-2 font-medium text-destructive">
            {notice}
          </p>
        ))}
      </div>

      {sheet.warnings.map((warning) => (
        <p key={warning} className="text-sm text-destructive">
          {warning}
        </p>
      ))}

      <div className="space-y-3">
        {sheet.days.map((day) => (
          <DayEditor
            key={day.day}
            day={day}
            month={sheet.month}
            onChange={replaceDay}
          />
        ))}
      </div>

      {openDays.length > 0 ? (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">日を追加</span>
          <select
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base"
            value=""
            onChange={(event) => {
              const day = Number(event.target.value);
              if (!day) {
                return;
              }
              onChange({
                ...sheet,
                days: [...sheet.days, emptyAttendanceDay(day)].sort(
                  (left, right) => left.day - right.day,
                ),
              });
            }}
          >
            <option value="">日付を選ぶ</option>
            {openDays.map((day) => (
              <option key={day} value={day}>
                {day}日
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onRemove ? (
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onRemove}>
          この勤務表を削除
        </Button>
      ) : null}
    </section>
  );
}
