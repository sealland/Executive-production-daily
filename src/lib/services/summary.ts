import { getCeoPool, sql } from "@/lib/db/ceo";
import {
  achievementStatus,
  calcAchievementPct,
  calcYieldPct,
  calcYoyPct
} from "@/lib/calc/achievement";
import { previousDay, resolvePeriod, samePeriodPreviousYear, MONTH_LABELS_TH } from "@/lib/calc/periods";
import {
  getCppMonthlyTarget,
  getCppPeriodTarget
} from "@/lib/cpp/targets";
import {
  ACTUAL_EXPR,
  GRADE_B_EXPR,
  PLANT_EXPR,
  REJECT_EXPR,
  TARGET_EXPR,
  bindProductionFilters
} from "@/lib/query/productionFilters";
import { buildDowntimeConditions } from "@/lib/query/downtimeFilters";
import { normalizePlant } from "@/lib/constants/plants";
import type { DashboardFilters, KpiMetric } from "@/lib/types/production";
import { getDowntimePool, getDowntimeTable, isDowntimeConfigured } from "@/lib/db/downtime";

function canUseCppTarget(filters: DashboardFilters) {
  return !filters.line && !filters.materialCode && !filters.productGroup;
}

async function sumProduction(
  filters: DashboardFilters,
  startDate: string,
  endDate: string
) {
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped: DashboardFilters = { ...filters, startDate, endDate };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon,
      SUM(${GRADE_B_EXPR}) AS gradeBTon,
      SUM(${REJECT_EXPR}) AS rejectTon
    FROM dbo.tbl_prd_summary_new
    ${where}
  `);

  const row = result.recordset[0] || {};
  return {
    actualTon: Number(row.actualTon || 0),
    targetTon: Number(row.targetTon || 0),
    gradeBTon: Number(row.gradeBTon || 0),
    rejectTon: Number(row.rejectTon || 0)
  };
}

async function downtimeMinutes(date: string, filters: DashboardFilters) {
  if (!isDowntimeConfigured()) return 0;
  const pool = await getDowntimePool();
  const request = pool.request();
  request.input("d", sql.Date, date);
  const conditions = ["CONVERT(date, StartTime) = @d", ...buildDowntimeConditions(request, filters)];
  const result = await request.query(`
    SELECT ISNULL(SUM(Minute), 0) AS minutes
    FROM ${getDowntimeTable()}
    WHERE ${conditions.join(" AND ")}
  `);
  return Number(result.recordset[0]?.minutes || 0);
}

export async function getSummaryKpis(filters: DashboardFilters): Promise<KpiMetric[]> {
  const period = resolvePeriod(filters);
  const today = period.anchorDate;
  const mtdStart = `${today.slice(0, 4)}-${today.slice(5, 7)}-01`;
  const ytdStart = `${today.slice(0, 4)}-01-01`;
  const prev = samePeriodPreviousYear(ytdStart, today);
  const prevDay = previousDay(today);
  const asOfNote = today === period.today ? undefined : `ข้อมูล ณ วันที่ ${today}`;

  const [todaySum, mtd, ytd, yoyPrev, dtToday, dtPrev] = await Promise.all([
    sumProduction(filters, today, today),
    sumProduction(filters, mtdStart, today),
    sumProduction(filters, ytdStart, today),
    sumProduction(filters, prev.startDate, prev.endDate),
    downtimeMinutes(today, filters),
    downtimeMinutes(prevDay, filters)
  ]);

  const todayAch = calcAchievementPct(todaySum.actualTon, todaySum.targetTon);

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const useCpp = canUseCppTarget(filters);
  const cppMtd = useCpp ? getCppMonthlyTarget(year, month, filters.plant) : null;
  const cppYtd = useCpp ? getCppPeriodTarget(year, 1, month, filters.plant) : null;
  const mtdTarget = cppMtd ?? mtd.targetTon;
  const ytdTarget = cppYtd ?? ytd.targetTon;

  const mtdAch = calcAchievementPct(mtd.actualTon, mtdTarget);
  const ytdAch = calcAchievementPct(ytd.actualTon, ytdTarget);
  const yoy = calcYoyPct(ytd.actualTon, yoyPrev.actualTon);
  const yieldPct = calcYieldPct(todaySum.actualTon, todaySum.gradeBTon, todaySum.rejectTon);
  const cppNote =
    cppMtd != null || cppYtd != null
      ? `เป้าจาก CPP 2026 · ${MONTH_LABELS_TH[month - 1]} ${year}`
      : undefined;

  return [
    {
      key: "productionToday",
      label: "Production Today",
      value: todaySum.actualTon,
      unit: "T",
      achievementPct: todayAch,
      status: achievementStatus(todayAch),
      note: asOfNote
    },
    {
      key: "targetToday",
      label: "Target Today",
      value: todaySum.targetTon,
      unit: "T",
      note: asOfNote
    },
    {
      key: "mtd",
      label: "MTD Production",
      value: mtd.actualTon,
      unit: "T",
      secondaryLabel: "Target MTD",
      secondaryValue: mtdTarget,
      secondaryUnit: "T",
      achievementPct: mtdAch,
      status: achievementStatus(mtdAch),
      note: cppNote
    },
    {
      key: "ytd",
      label: "YTD Production",
      value: ytd.actualTon,
      unit: "T",
      secondaryLabel: "Target YTD",
      secondaryValue: ytdTarget,
      secondaryUnit: "T",
      achievementPct: ytdAch,
      status: achievementStatus(ytdAch),
      note: cppNote
    },
    {
      key: "yoy",
      label: "YoY Growth",
      value: yoy,
      unit: "%",
      delta: yoy,
      deltaLabel: "เทียบช่วงเดียวกันปีก่อน",
      status: yoy === null ? "neutral" : yoy >= 0 ? "green" : "red"
    },
    {
      key: "oee",
      label: "OEE",
      value: null,
      unit: "%",
      placeholder: true,
      note: "ข้อมูล OEE ยังไม่สมบูรณ์"
    },
    {
      key: "yield",
      label: "Yield",
      value: yieldPct,
      unit: "%",
      note: "คำนวณชั่วคราวจาก Good / (Good+B+Reject)",
      status: achievementStatus(yieldPct)
    },
    {
      key: "downtime",
      label: "Downtime Today",
      value: dtToday,
      unit: "min",
      delta: dtToday - dtPrev,
      deltaLabel: "เทียบวันก่อน",
      note: asOfNote
    }
  ];
}

export async function getFilterOptions(filters: DashboardFilters) {
  const pool = await getCeoPool();
  const request = pool.request();
  const period = resolvePeriod(filters);
  // Options span the whole year so the dropdowns stay stable when a single day is picked.
  const optionYear = period.anchorDate.slice(0, 4);
  const scoped = {
    ...filters,
    startDate: `${optionYear}-01-01`,
    endDate: `${optionYear}-12-31`,
    plant: undefined,
    line: undefined,
    productGroup: undefined,
    materialCode: undefined
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT DISTINCT
      ${PLANT_EXPR} AS plant,
      prd_station AS line,
      material_code AS materialCode,
      ISNULL(NULLIF(internal_name, ''), ISNULL(prd_type, material_code)) AS productName,
      NULLIF(prd_size, '') AS size,
      YEAR(prd_date) AS yr
    FROM dbo.tbl_prd_summary_new
    ${where}
  `);

  const plants = new Set<string>();
  const lines: { plant: string; line: string }[] = [];
  const lineSet = new Set<string>();
  const products: { materialCode: string; name: string; productGroup: string | null }[] = [];
  const productSet = new Set<string>();
  const sizes = new Set<string>();
  const years = new Set<number>();

  for (const row of result.recordset) {
    if (row.plant) plants.add(normalizePlant(String(row.plant)) || String(row.plant));
    if (row.plant && row.line) {
      const plant = normalizePlant(String(row.plant)) || String(row.plant);
      const key = `${plant}|${row.line}`;
      if (!lineSet.has(key)) {
        lineSet.add(key);
        lines.push({ plant, line: String(row.line) });
      }
    }
    if (row.materialCode) {
      const key = String(row.materialCode);
      if (!productSet.has(key)) {
        productSet.add(key);
        products.push({
          materialCode: key,
          name: String(row.productName || key),
          productGroup: null
        });
      }
    }
    if (row.size) sizes.add(String(row.size));
    if (row.yr) years.add(Number(row.yr));
  }

  const yearResult = await pool.request().query(`
    SELECT DISTINCT YEAR(prd_date) AS yr
    FROM dbo.tbl_prd_summary_new
    WHERE prd_date IS NOT NULL
  `);
  for (const row of yearResult.recordset) {
    if (row.yr) years.add(Number(row.yr));
  }

  let productGroups: string[] = [];
  try {
    const mg = await pool.request().query(`
      SELECT DISTINCT product_group
      FROM dbo.tbl_matgroup
      WHERE product_group IS NOT NULL AND LTRIM(RTRIM(product_group)) <> ''
      ORDER BY product_group
    `);
    productGroups = mg.recordset.map((r: { product_group: string }) => r.product_group);
  } catch {
    productGroups = [];
  }

  let shifts: string[] = [];
  if (isDowntimeConfigured()) {
    try {
      const dt = await getDowntimePool();
      const shiftResult = await dt.request().query(`
        SELECT DISTINCT shift
        FROM ${getDowntimeTable()}
        WHERE shift IS NOT NULL AND LTRIM(RTRIM(shift)) <> ''
        ORDER BY shift
      `);
      shifts = shiftResult.recordset.map((r: { shift: string }) => String(r.shift));
    } catch {
      shifts = [];
    }
  }

  return {
    plants: [...plants].sort(),
    lines: lines.sort((a, b) => a.plant.localeCompare(b.plant) || a.line.localeCompare(b.line)),
    productGroups,
    products: products.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500),
    sizes: [...sizes].sort(),
    grades: [],
    shifts,
    years: [...years].sort((a, b) => b - a)
  };
}
