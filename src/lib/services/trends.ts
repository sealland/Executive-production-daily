import { getCeoPool } from "@/lib/db/ceo";
import {
  achievementStatus,
  calcAchievementPct,
  calcYoyPct
} from "@/lib/calc/achievement";
import { calcForecast } from "@/lib/calc/forecast";
import { MONTH_LABELS_TH, resolvePeriod, toDateString } from "@/lib/calc/periods";
import {
  getCppMonthlyTarget,
  getCppYearlyTarget
} from "@/lib/cpp/targets";
import {
  ACTUAL_EXPR,
  TARGET_EXPR,
  bindProductionFilters
} from "@/lib/query/productionFilters";
import type {
  DailyPoint,
  DashboardFilters,
  ForecastMetrics,
  MonthlyPoint,
  YearlyPoint
} from "@/lib/types/production";
import { endOfMonth, eachDayOfInterval, startOfMonth, subDays } from "date-fns";

function canUseCppTarget(filters: DashboardFilters) {
  // CPP is plant/company monthly plan — not broken down by line or product.
  return !filters.line && !filters.materialCode && !filters.productGroup;
}

export async function getDailyTrend(filters: DashboardFilters): Promise<DailyPoint[]> {
  const period = resolvePeriod(filters);
  const end = new Date(period.endDate < period.today ? period.endDate : period.today);
  const start = subDays(end, 29);
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: toDateString(start),
    endDate: toDateString(end)
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      CONVERT(varchar(10), prd_date, 23) AS d,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY prd_date
    ORDER BY prd_date
  `);

  const map = new Map<string, { actualTon: number; targetTon: number }>();
  for (const row of result.recordset) {
    map.set(String(row.d), {
      actualTon: Number(row.actualTon || 0),
      targetTon: Number(row.targetTon || 0)
    });
  }

  const days = eachDayOfInterval({ start, end });
  const points: DailyPoint[] = days.map((day) => {
    const date = toDateString(day);
    const found = map.get(date) || { actualTon: 0, targetTon: 0 };
    const achievementPct = calcAchievementPct(found.actualTon, found.targetTon);
    return {
      date,
      actualTon: found.actualTon,
      targetTon: found.targetTon,
      achievementPct,
      differenceTon: found.actualTon - found.targetTon,
      ma7Ton: null,
      belowTarget: found.targetTon > 0 && found.actualTon < found.targetTon
    };
  });

  for (let i = 0; i < points.length; i += 1) {
    const slice = points.slice(Math.max(0, i - 6), i + 1);
    const avg = slice.reduce((sum, p) => sum + p.actualTon, 0) / slice.length;
    points[i].ma7Ton = avg;
  }

  return points;
}

export async function getMonthlyTrend(filters: DashboardFilters): Promise<MonthlyPoint[]> {
  const period = resolvePeriod(filters);
  const year = period.year;
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: `${year - 1}-01-01`,
    endDate: `${year}-12-31`
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      YEAR(prd_date) AS yr,
      MONTH(prd_date) AS mo,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY YEAR(prd_date), MONTH(prd_date)
  `);

  const curr = new Map<number, { actual: number; target: number }>();
  const prev = new Map<number, number>();
  for (const row of result.recordset) {
    const mo = Number(row.mo);
    if (Number(row.yr) === year) {
      curr.set(mo, {
        actual: Number(row.actualTon || 0),
        target: Number(row.targetTon || 0)
      });
    } else if (Number(row.yr) === year - 1) {
      prev.set(mo, Number(row.actualTon || 0));
    }
  }

  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const c = curr.get(month) || { actual: 0, target: 0 };
    const p = prev.get(month) || 0;
    const cppTarget =
      canUseCppTarget(filters) ? getCppMonthlyTarget(year, month, filters.plant) : null;
    const targetTon = cppTarget ?? c.target;
    const achievementPct = calcAchievementPct(c.actual, targetTon);
    return {
      month,
      monthLabel: MONTH_LABELS_TH[idx],
      actualTon: c.actual,
      targetTon,
      previousYearTon: p,
      achievementPct,
      yoyPct: calcYoyPct(c.actual, p)
    };
  });
}

export async function getYearlyTrend(filters: DashboardFilters): Promise<YearlyPoint[]> {
  const period = resolvePeriod(filters);
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: `${period.year - 4}-01-01`,
    endDate: `${period.year}-12-31`
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      YEAR(prd_date) AS yr,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY YEAR(prd_date)
    ORDER BY YEAR(prd_date)
  `);

  const rows = result.recordset.map((row: { yr: number; actualTon: number; targetTon: number }) => {
    const year = Number(row.yr);
    const dbTarget = Number(row.targetTon || 0);
    const cppTarget =
      canUseCppTarget(filters) ? getCppYearlyTarget(year, filters.plant) : null;
    return {
      year,
      actualTon: Number(row.actualTon || 0),
      targetTon: cppTarget ?? dbTarget
    };
  });

  return rows.map((row, index) => ({
    ...row,
    yoyPct: index === 0 ? null : calcYoyPct(row.actualTon, rows[index - 1].actualTon)
  }));
}

export async function getForecast(filters: DashboardFilters): Promise<ForecastMetrics> {
  const period = resolvePeriod(filters);
  const monthStart = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
  const monthEndDate = endOfMonth(new Date(period.year, period.month - 1, 1));
  const monthEnd = toDateString(monthEndDate);
  const asOf = period.today < monthEnd ? period.today : monthEnd;

  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = { ...filters, startDate: monthStart, endDate: asOf };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon,
      COUNT(DISTINCT prd_date) AS workingDaysElapsed
    FROM dbo.tbl_prd_summary_new
    ${where}
  `);

  const fullMonthRequest = pool.request();
  const fullScoped = { ...filters, startDate: monthStart, endDate: monthEnd };
  const fullConditions = bindProductionFilters(fullMonthRequest, fullScoped);
  const fullWhere = fullConditions.length ? `WHERE ${fullConditions.join(" AND ")}` : "";
  const full = await fullMonthRequest.query(`
    SELECT
      SUM(${TARGET_EXPR}) AS targetTon,
      COUNT(DISTINCT CASE WHEN ${ACTUAL_EXPR} > 0 OR ${TARGET_EXPR} > 0 THEN prd_date END) AS workingDaysInMonth
    FROM dbo.tbl_prd_summary_new
    ${fullWhere}
  `);

  // If future days have targets only in plan-like rows, use calendar weekday proxy fallback
  const row = result.recordset[0] || {};
  const fullRow = full.recordset[0] || {};
  const mtdActualTon = Number(row.actualTon || 0);
  const dbMonthlyTarget = Number(fullRow.targetTon || row.targetTon || 0);
  const cppMonthly =
    canUseCppTarget(filters)
      ? getCppMonthlyTarget(period.year, period.month, filters.plant)
      : null;
  const monthlyTargetTon = cppMonthly ?? dbMonthlyTarget;
  const workingDaysElapsed = Number(row.workingDaysElapsed || 0);
  let workingDaysInMonth = Number(fullRow.workingDaysInMonth || 0);

  if (workingDaysInMonth < workingDaysElapsed) {
    workingDaysInMonth = workingDaysElapsed;
  }
  if (workingDaysInMonth === 0) {
    const days = eachDayOfInterval({
      start: startOfMonth(new Date(monthStart)),
      end: monthEndDate
    });
    workingDaysInMonth = days.filter((d) => d.getDay() !== 0).length;
  }

  const forecast = calcForecast({
    mtdActualTon,
    monthlyTargetTon,
    workingDaysElapsed: Math.max(workingDaysElapsed, 1),
    workingDaysInMonth: Math.max(workingDaysInMonth, 1)
  });

  return {
    mtdActualTon,
    monthlyTargetTon,
    forecastTon: forecast.forecastTon,
    forecastAchievementPct: forecast.forecastAchievementPct,
    remainingTargetTon: forecast.remainingTargetTon,
    remainingWorkingDays: forecast.remainingWorkingDays,
    requiredDailyTon: forecast.requiredDailyTon,
    workingDaysElapsed,
    workingDaysInMonth
  };
}
