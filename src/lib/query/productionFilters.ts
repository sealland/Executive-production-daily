import type { DashboardFilters } from "@/lib/types/production";
import { sql } from "@/lib/db/ceo";
import { normalizePlant, PLANT_EXPR } from "@/lib/constants/plants";
import { alignDashboardFilters } from "@/lib/query/alignFilters";

export { PLANT_EXPR };

export const ACTUAL_EXPR = `ISNULL(prd_a, 0)`;
export const TARGET_EXPR = `ISNULL(TRY_CONVERT(float, prd_goal), 0)`;
export const GRADE_B_EXPR = `ISNULL(prd_b, 0)`;
export const REJECT_EXPR = `ISNULL(prd_r, 0)`;

export function bindProductionFilters(
  request: sql.Request,
  filters: DashboardFilters,
  options?: { dateFromParam?: string; dateToParam?: string; alias?: string }
) {
  const alias = options?.alias ? `${options.alias}.` : "";
  const conditions: string[] = [];

  const fromParam = options?.dateFromParam || "startDate";
  const toParam = options?.dateToParam || "endDate";

  if (filters.startDate) {
    request.input(fromParam, sql.Date, filters.startDate);
    conditions.push(`${alias}prd_date >= @${fromParam}`);
  }
  if (filters.endDate) {
    request.input(toParam, sql.Date, filters.endDate);
    conditions.push(`${alias}prd_date <= @${toParam}`);
  }
  if (filters.plant) {
    const plant = normalizePlant(filters.plant);
    request.input("plant", sql.NVarChar, plant);
    conditions.push(`(${PLANT_EXPR.replace(/prd_plant/g, `${alias}prd_plant`)}) = @plant`);
  }
  if (filters.line) {
    request.input("line", sql.NVarChar, filters.line);
    conditions.push(`${alias}prd_station = @line`);
  }
  if (filters.materialCode) {
    request.input("materialCode", sql.NVarChar, filters.materialCode);
    conditions.push(`${alias}material_code = @materialCode`);
  }
  if (filters.productGroup) {
    request.input("productGroup", sql.NVarChar, filters.productGroup);
    conditions.push(`EXISTS (
      SELECT 1 FROM dbo.tbl_matgroup mg
      WHERE mg.product_group = @productGroup
        AND LEFT(ISNULL(${alias}material_code, ''), LEN(mg.mat_group)) = mg.mat_group
    )`);
  }

  return conditions;
}

export function parseFilters(searchParams: URLSearchParams): DashboardFilters {
  const num = (key: string) => {
    const v = searchParams.get(key);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return alignDashboardFilters({
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    year: num("year"),
    month: num("month"),
    plant: normalizePlant(searchParams.get("plant")) || undefined,
    line: searchParams.get("line") || undefined,
    productGroup: searchParams.get("productGroup") || undefined,
    materialCode: searchParams.get("materialCode") || undefined,
    shift: searchParams.get("shift") || undefined,
    search: searchParams.get("search") || undefined,
    page: num("page") || 1,
    pageSize: num("pageSize") || 50,
    sortBy: searchParams.get("sortBy") || undefined,
    sortDir: searchParams.get("sortDir") === "asc" ? "asc" : "desc"
  });
}
