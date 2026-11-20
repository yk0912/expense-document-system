const MINUTES_PER_DAY = 24 * 60;
const EARLY_MORNING_END = 5 * 60;
const EARLY_NIGHT_START = 22 * 60;

export function parseClock(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const text = value.normalize("NFKC").trim();
  if (!text || /^[~〜～\-ー−―.・．:：\s]+$/.test(text)) {
    return null;
  }
  const match = text.match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
    return null;
  }
  return hour * 60 + minute;
}

export function formatClock(minutes: number | null): string {
  if (minutes == null) {
    return "";
  }
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

function workInterval(start: number, end: number): [number, number] | null {
  if (end === start) {
    return null;
  }
  return [start, end > start ? end : end + MINUTES_PER_DAY];
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function alignInside(
  workStart: number,
  workEnd: number,
  start: number,
  end: number,
): [number, number] | null {
  const interval = workInterval(start, end);
  if (!interval) {
    return null;
  }
  const candidates: Array<[number, number]> = [
    interval,
    [interval[0] + MINUTES_PER_DAY, interval[1] + MINUTES_PER_DAY],
    [interval[0] - MINUTES_PER_DAY, interval[1] - MINUTES_PER_DAY],
  ];
  let best: [number, number] | null = null;
  let bestOverlap = 0;
  for (const candidate of candidates) {
    const amount = overlap(workStart, workEnd, candidate[0], candidate[1]);
    if (amount > bestOverlap) {
      best = candidate;
      bestOverlap = amount;
    }
  }
  return best;
}

function earlyWindows(workStart: number, workEnd: number): Array<[number, number]> {
  const windows: Array<[number, number]> = [];
  const firstDay = Math.floor(workStart / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  for (let day = firstDay; day < workEnd + MINUTES_PER_DAY; day += MINUTES_PER_DAY) {
    windows.push([day, day + EARLY_MORNING_END]);
    windows.push([day + EARLY_NIGHT_START, day + MINUTES_PER_DAY]);
  }
  return windows;
}

export function actualHoursBetween(
  workStart: string | null,
  workEnd: string | null,
  breakStart: string | null,
  breakEnd: string | null,
): number | null {
  const start = parseClock(workStart);
  const end = parseClock(workEnd);
  if (start == null || end == null) {
    return null;
  }
  const work = workInterval(start, end);
  if (!work) {
    return null;
  }
  let minutes = work[1] - work[0];
  const breakStartMinutes = parseClock(breakStart);
  const breakEndMinutes = parseClock(breakEnd);
  if (breakStartMinutes != null && breakEndMinutes != null) {
    const rest = alignInside(work[0], work[1], breakStartMinutes, breakEndMinutes);
    if (rest) {
      minutes -= overlap(work[0], work[1], rest[0], rest[1]);
    }
  }
  return roundHours(Math.max(0, minutes));
}

/** 22:00〜翌5:00。5:00ちょうどまでを含み、5:00開始は含まない。 */
export function earlyHoursBetween(
  workStart: string | null,
  workEnd: string | null,
  breakStart: string | null,
  breakEnd: string | null,
): number | null {
  const start = parseClock(workStart);
  const end = parseClock(workEnd);
  if (start == null || end == null) {
    return null;
  }
  const work = workInterval(start, end);
  if (!work) {
    return null;
  }
  let minutes = 0;
  for (const window of earlyWindows(work[0], work[1])) {
    minutes += overlap(work[0], work[1], window[0], window[1]);
  }
  const breakStartMinutes = parseClock(breakStart);
  const breakEndMinutes = parseClock(breakEnd);
  if (breakStartMinutes != null && breakEndMinutes != null) {
    const rest = alignInside(work[0], work[1], breakStartMinutes, breakEndMinutes);
    if (rest) {
      for (const window of earlyWindows(work[0], work[1])) {
        const windowStart = Math.max(rest[0], window[0]);
        const windowEnd = Math.min(rest[1], window[1]);
        if (windowEnd > windowStart) {
          minutes -= overlap(work[0], work[1], windowStart, windowEnd);
        }
      }
    }
  }
  return roundHours(Math.max(0, minutes));
}
