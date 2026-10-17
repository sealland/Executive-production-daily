import { getRmSourcePool, isRmSourceConfigured, sql } from "@/lib/db/rmSources";

const RMD_FG_TAG_TABLE = "dbo.tbl_rmd_weight_line";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_KEYS = 50;

/** WHERE filters for tag-sum RM (cancelled X and non-positive weight excluded in SQL). */
export const RMD7_LINE_RM_FILTER_SQL = `ISNULL(l.rmd_tis_check, '') <> 'X' AND l.rmd_weight > 0`;

type CacheEntry = { rmTon: number; expiresAt: number };
const rmTonCache = new Map<string, CacheEntry>();

function cacheKey(reportDate: string) {
  return `RMD7:${reportDate}`;
}

function getCachedRmTon(reportDate: string): number | undefined {
  const key = cacheKey(reportDate);
  const hit = rmTonCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    rmTonCache.delete(key);
    return undefined;
  }
  return hit.rmTon;
}

function setCachedRmTon(reportDate: string, rmTon: number) {
  if (rmTonCache.size >= CACHE_MAX_KEYS) {
    const oldest = rmTonCache.keys().next().value;
    if (oldest) rmTonCache.delete(oldest);
  }
  rmTonCache.set(cacheKey(reportDate), { rmTon, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Convert Σ rmd_weight (kg) to RM tons for RMD7 yield. */
export function rmd7KgSumToRmWeightTon(totalKg: number): number {
  return totalKg / 1000;
}

/** RMD7 yield % = prd_a ÷ ΣRM (tons); one decimal; null when actual or RM missing/zero. */
export function computeRmd7YieldPct(actualTon: number, rmWeightTon: number | null): number | null {
  // สูตรชั่วคราว — ยังไม่มีข้อสรุปจากหน้างาน (2026-10-17): Yield = prd_a / Σ tag weight ทั้งวัน; เฉลยหน้างาน 16/10 = 96.9%
  if (actualTon <= 0 || rmWeightTon == null || rmWeightTon <= 0) return null;
  const pct = (actualTon / rmWeightTon) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Σ rmd_weight (tons) for RMD7 on reportDate — all tags that day (every period/grade).
 * Read-only; 1 aggregate query/day; in-memory cache TTL 5m, max 50 keys.
 */
export async function getRmd7RmWeightTon(reportDate: string): Promise<number | null> {
  if (!isRmSourceConfigured("RMD7")) return null;

  const cached = getCachedRmTon(reportDate);
  if (cached !== undefined) return cached;

  const pool = await getRmSourcePool("RMD7");
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT SUM(l.rmd_weight) AS total_kg
      FROM ${RMD_FG_TAG_TABLE} l
      WHERE l.rmd_date >= @d AND l.rmd_date < DATEADD(day, 1, @d)
        AND ${RMD7_LINE_RM_FILTER_SQL}
    `);

  const totalKg = Number((result.recordset[0] as { total_kg: number | null } | undefined)?.total_kg ?? 0);
  const rmTon = totalKg > 0 ? rmd7KgSumToRmWeightTon(totalKg) : 0;
  setCachedRmTon(reportDate, rmTon);
  return rmTon;
}
