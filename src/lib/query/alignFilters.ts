import { endOfMonth, startOfMonth } from "date-fns";
import { normalizePlant } from "@/lib/constants/plants";
import type { DashboardFilters } from "@/lib/types/production";
import { toDateString, todayString } from "@/lib/calc/periods";

/** First/last day of a calendar month, capped at today for endDate. */
export function monthDateRange(year: number, month: number) {
  const base = new Date(year, month - 1, 1);
  const startDate = toDateString(startOfMonth(base));
  const monthEnd = toDateString(endOfMonth(base));
  const today = todayString();
  const endDate = monthEnd > today ? today : monthEnd;
  return { year, month, startDate, endDate };
}

/**
 * Keep year/month/startDate/endDate consistent.
 * endDate is the source of truth for which month's CPP targets apply.
 */
export function alignDashboardFilters(filters: DashboardFilters): DashboardFilters {
  const today = todayString();
  let { startDate, endDate, year, month, plant, ...rest } = filters;
  plant = normalizePlant(plant);

  if (endDate) {
    year = Number(endDate.slice(0, 4));
    month = Number(endDate.slice(5, 7));
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    if (!startDate || startDate > endDate) {
      startDate = monthStart;
    }
  } else if (year && month) {
    const range = monthDateRange(year, month);
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (startDate && !endDate) {
    endDate = startDate > today ? startDate : today;
    year = Number(endDate.slice(0, 4));
    month = Number(endDate.slice(5, 7));
  }

  return {
    ...rest,
    plant,
    year,
    month,
    startDate,
    endDate
  };
}
