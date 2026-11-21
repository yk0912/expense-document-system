import { daysInMonth } from "@/lib/attendance/sheet-header";

function dateKey(month: number, day: number): string {
  return `${month}-${day}`;
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}

function addDate(days: Set<string>, month: number, day: number) {
  days.add(dateKey(month, day));
}

/** 1980–2099年の春分・秋分。 */
function equinoxDay(year: number, autumn: boolean): number {
  const delta = year - 1980;
  const base = autumn ? 23.2488 : 20.8431;
  return Math.floor(base + 0.242194 * delta) - Math.floor(delta / 4);
}

function namedHolidays(year: number): Set<string> {
  const days = new Set<string>();
  addDate(days, 1, 1);
  addDate(days, 1, nthWeekday(year, 1, 1, 2));
  addDate(days, 2, 11);
  if (year >= 2020) {
    addDate(days, 2, 23);
  } else if (year <= 2018) {
    addDate(days, 12, 23);
  }
  addDate(days, 3, equinoxDay(year, false));
  addDate(days, 4, 29);
  addDate(days, 5, 3);
  addDate(days, 5, 4);
  addDate(days, 5, 5);
  if (year === 2020) {
    addDate(days, 7, 23);
    addDate(days, 7, 24);
    addDate(days, 8, 10);
  } else if (year === 2021) {
    addDate(days, 7, 22);
    addDate(days, 7, 23);
    addDate(days, 8, 8);
  } else {
    addDate(days, 7, year >= 2003 ? nthWeekday(year, 7, 1, 3) : 20);
    if (year >= 2016) {
      addDate(days, 8, 11);
    }
    addDate(days, 10, nthWeekday(year, 10, 1, 2));
  }
  addDate(days, 9, year >= 2003 ? nthWeekday(year, 9, 1, 3) : 15);
  addDate(days, 9, equinoxDay(year, true));
  addDate(days, 11, 3);
  addDate(days, 11, 23);
  if (year === 2019) {
    addDate(days, 5, 1);
    addDate(days, 10, 22);
  }
  return days;
}

function shift(year: number, month: number, day: number, amount: number): Date {
  return new Date(year, month - 1, day + amount);
}

function addSubstituteHolidays(year: number, days: Set<string>) {
  for (const key of [...days]) {
    const [month, day] = key.split("-").map(Number);
    if (month == null || day == null) {
      continue;
    }
    if (new Date(year, month - 1, day).getDay() !== 0) {
      continue;
    }
    let cursor = shift(year, month, day, 1);
    while (days.has(dateKey(cursor.getMonth() + 1, cursor.getDate()))) {
      cursor = shift(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), 1);
    }
    if (cursor.getFullYear() === year) {
      days.add(dateKey(cursor.getMonth() + 1, cursor.getDate()));
    }
  }
}

function addCitizensHolidays(year: number, days: Set<string>) {
  for (let month = 1; month <= 12; month += 1) {
    const length = daysInMonth(year, month);
    for (let day = 1; day <= length; day += 1) {
      const key = dateKey(month, day);
      if (days.has(key)) {
        continue;
      }
      const previous = shift(year, month, day, -1);
      const next = shift(year, month, day, 1);
      if (previous.getFullYear() !== year || next.getFullYear() !== year) {
        continue;
      }
      if (
        days.has(dateKey(previous.getMonth() + 1, previous.getDate())) &&
        days.has(dateKey(next.getMonth() + 1, next.getDate()))
      ) {
        days.add(key);
      }
    }
  }
}

export function japaneseHolidays(year: number): Set<string> {
  const days = namedHolidays(year);
  addSubstituteHolidays(year, days);
  addCitizensHolidays(year, days);
  addSubstituteHolidays(year, days);
  return days;
}

/** 土日と、祝日・振替休日・国民の休日。 */
export function weekendAndHolidayDays(year: number, month: number): number[] {
  const holidays = japaneseHolidays(year);
  const length = daysInMonth(year, month);
  const days: number[] = [];
  for (let day = 1; day <= length; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 0 || weekday === 6 || holidays.has(dateKey(month, day))) {
      days.push(day);
    }
  }
  return days;
}
