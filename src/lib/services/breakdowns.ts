import { getCeoPool } from "@/lib/db/ceo";
import { achievementStatus, calcAchievementPct } from "@/lib/calc/achievement";
import { resolvePeriod } from "@/lib/calc/periods";
import { getCppPlantPeriodTarget } from "@/lib/cpp/targets";
import { CANONICAL_PLANTS, normalizePlant } from "@/lib/constants/plants";
import {
  ACTUAL_EXPR,
  PLANT_EXPR,
  TARGET_EXPR,
  bindProductionFilters
} from "@/lib/query/productionFilters";
import type {
  DashboardFilters,
  LineRow,
  PlantRow,
  ProductRow
} from "@/lib/types/production";

function canUseCppTarget(filters: DashboardFilters) {
  return !filters.line && !filters.materialCode && !filters.productGroup;
}

export async function getByPlant(filters: DashboardFilters): Promise<PlantRow[]> {
  const period = resolvePeriod(filters);
  const pool = await getCeoPool();
  const request = pool.request();
  const startDate = filters.startDate || period.startDate;
  const endDate = filters.endDate || period.endDate;
  const scoped = {
    ...filters,
    startDate,
    endDate
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      ${PLANT_EXPR} AS plant,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY ${PLANT_EXPR}
    ORDER BY SUM(${ACTUAL_EXPR}) DESC
  `);

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const monthFrom = Number(startDate.slice(5, 7));
  const monthTo = Number(endDate.slice(5, 7));
  const useCpp = canUseCppTarget(filters) && startYear === endYear;

  const merged = new Map<string, { actualTon: number; targetTon: number }>();
  for (const row of result.recordset as Array<{
    plant: string;
    actualTon: number;
    targetTon: number;
  }>) {
    const plant = normalizePlant(String(row.plant)) || String(row.plant || "—");
    const prev = merged.get(plant) || { actualTon: 0, targetTon: 0 };
    merged.set(plant, {
      actualTon: prev.actualTon + Number(row.actualTon || 0),
      targetTon: prev.targetTon + Number(row.targetTon || 0)
    });
  }

  const rows = [...merged.entries()].map(([plant, sums]) => {
    const actualTon = sums.actualTon;
    const dbTarget = sums.targetTon;
    const cppTarget = useCpp
      ? getCppPlantPeriodTarget(startYear, monthFrom, monthTo, plant)
      : null;
    const targetTon = cppTarget ?? dbTarget;
    const achievementPct = calcAchievementPct(actualTon, targetTon);
    return {
      plant,
      actualTon,
      targetTon,
      achievementPct,
      sharePct: null as number | null,
      status: achievementStatus(achievementPct)
    };
  });

  if (useCpp && !filters.plant) {
    for (const plant of CANONICAL_PLANTS) {
      if (rows.some((r) => r.plant === plant)) continue;
      const cppTarget = getCppPlantPeriodTarget(startYear, monthFrom, monthTo, plant);
      if (cppTarget == null) continue;
      rows.push({
        plant,
        actualTon: 0,
        targetTon: cppTarget,
        achievementPct: calcAchievementPct(0, cppTarget),
        sharePct: null,
        status: achievementStatus(calcAchievementPct(0, cppTarget))
      });
    }
  }

  rows.sort((a, b) => b.actualTon - a.actualTon);

  const total = rows.reduce((sum, r) => sum + r.actualTon, 0);
  return rows.map((r) => ({
    ...r,
    sharePct: total > 0 ? (r.actualTon / total) * 100 : null
  }));
}

export async function getByLine(filters: DashboardFilters): Promise<LineRow[]> {
  const period = resolvePeriod(filters);
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: filters.startDate || period.startDate,
    endDate: filters.endDate || period.endDate
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      ${PLANT_EXPR} AS plant,
      prd_station AS line,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY ${PLANT_EXPR}, prd_station
  `);

  const rows = result.recordset.map((row: { plant: string; line: string; actualTon: number; targetTon: number }) => {
    const actualTon = Number(row.actualTon || 0);
    const targetTon = Number(row.targetTon || 0);
    const achievementPct = calcAchievementPct(actualTon, targetTon);
    return {
      plant: String(row.plant || "—"),
      line: String(row.line || "—"),
      actualTon,
      targetTon,
      achievementPct,
      status: achievementStatus(achievementPct)
    };
  });

  return rows.sort((a, b) => {
    const av = a.achievementPct ?? 9999;
    const bv = b.achievementPct ?? 9999;
    return av - bv;
  });
}

export async function getByProduct(filters: DashboardFilters): Promise<ProductRow[]> {
  const period = resolvePeriod(filters);
  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: filters.startDate || period.startDate,
    endDate: filters.endDate || period.endDate
  };
  const conditions = bindProductionFilters(request, scoped);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT TOP 10
      ISNULL(material_code, '') AS materialCode,
      ISNULL(NULLIF(internal_name, ''), ISNULL(prd_type, material_code)) AS productName,
      SUM(${ACTUAL_EXPR}) AS actualTon,
      SUM(${TARGET_EXPR}) AS targetTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    GROUP BY ISNULL(material_code, ''), ISNULL(NULLIF(internal_name, ''), ISNULL(prd_type, material_code))
    ORDER BY SUM(${ACTUAL_EXPR}) DESC
  `);

  const rows = result.recordset.map((row: { materialCode: string; productName: string; actualTon: number; targetTon: number }) => {
    const actualTon = Number(row.actualTon || 0);
    const targetTon = Number(row.targetTon || 0);
    const achievementPct = calcAchievementPct(actualTon, targetTon);
    return {
      materialCode: String(row.materialCode || ""),
      productName: String(row.productName || row.materialCode || "—"),
      productGroup: null as string | null,
      actualTon,
      targetTon,
      sharePct: null as number | null,
      achievementPct,
      status: achievementStatus(achievementPct)
    };
  });

  const total = rows.reduce((sum, r) => sum + r.actualTon, 0);
  return rows.map((r) => ({
    ...r,
    sharePct: total > 0 ? (r.actualTon / total) * 100 : null
  }));
}
