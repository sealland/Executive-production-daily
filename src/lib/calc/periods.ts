import { format, startOfMonth, endOfMonth, startOfYear, subYears, subDays } from "date-fns";

export function toDateString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function todayString() {
  return toDateString(new Date());
}

/**
 * The date the "today" KPIs report on. When the user looks at a past period the
 * real calendar date has no data, so fall back to the last day of that period.
 */
function anchorFor(startDate: string, endDate: string) {
  const today = todayString();
  if (endDate < today) return endDate;
  if (startDate > today) return startDate;
  return today;
}

export function resolvePeriod(filters: {
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
}) {
  const today = new Date();
  const year = filters.year || today.getFullYear();
  const month = filters.month || today.getMonth() + 1;

  const build = (startDate: string, endDate: string, y: number, m: number) => ({
    startDate,
    endDate,
    year: y,
    month: m,
    today: todayString(),
    anchorDate: anchorFor(startDate, endDate)
  });

  if (filters.startDate || filters.endDate) {
    const startDate =
      filters.startDate || toDateString(startOfMonth(new Date(filters.endDate as string)));
    const fallbackEnd = startDate > todayString() ? startDate : todayString();
    const endDate = filters.endDate || fallbackEnd;
    const y = Number(endDate.slice(0, 4));
    const m = Number(endDate.slice(5, 7));
    return build(startDate, endDate, y, m);
  }

  if (filters.year && filters.month) {
    const base = new Date(year, month - 1, 1);
    return build(toDateString(startOfMonth(base)), toDateString(endOfMonth(base)), year, month);
  }

  if (filters.year) {
    const base = new Date(year, 0, 1);
    return build(toDateString(startOfYear(base)), `${year}-12-31`, year, month);
  }

  return build(
    toDateString(startOfMonth(today)),
    todayString(),
    today.getFullYear(),
    today.getMonth() + 1
  );
}

export function samePeriodPreviousYear(startDate: string, endDate: string) {
  const start = subYears(new Date(startDate), 1);
  const end = subYears(new Date(endDate), 1);
  return {
    startDate: toDateString(start),
    endDate: toDateString(end)
  };
}

export function previousDay(date: string) {
  return toDateString(subDays(new Date(date), 1));
}

export const MONTH_LABELS_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค."
];
