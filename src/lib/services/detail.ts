import { getCeoPool, sql } from "@/lib/db/ceo";
import { achievementStatus, calcAchievementPct, calcYieldPct } from "@/lib/calc/achievement";
import { resolvePeriod } from "@/lib/calc/periods";
import {
  ACTUAL_EXPR,
  GRADE_B_EXPR,
  PLANT_EXPR,
  REJECT_EXPR,
  TARGET_EXPR,
  bindProductionFilters
} from "@/lib/query/productionFilters";
import type { DashboardFilters, DetailRow, Paginated } from "@/lib/types/production";
import * as XLSX from "xlsx";

export async function getDetail(
  filters: DashboardFilters
): Promise<Paginated<DetailRow>> {
  const period = resolvePeriod(filters);
  const page = Math.max(filters.page || 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize || 50, 10), 200);
  const offset = (page - 1) * pageSize;

  const pool = await getCeoPool();
  const request = pool.request();
  const scoped = {
    ...filters,
    startDate: filters.startDate || `${period.year}-01-01`,
    endDate: filters.endDate || period.today
  };
  const conditions = bindProductionFilters(request, scoped);

  if (filters.search) {
    request.input("search", sql.NVarChar, `%${filters.search}%`);
    conditions.push(`(
      material_code LIKE @search
      OR prd_station LIKE @search
      OR prd_type LIKE @search
      OR internal_name LIKE @search
      OR prd_plant LIKE @search
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const countReq = pool.request();
  const countFilters = { ...scoped };
  const countConditions = bindProductionFilters(countReq, countFilters);
  if (filters.search) {
    countReq.input("search", sql.NVarChar, `%${filters.search}%`);
    countConditions.push(`(
      material_code LIKE @search
      OR prd_station LIKE @search
      OR prd_type LIKE @search
      OR internal_name LIKE @search
      OR prd_plant LIKE @search
    )`);
  }
  const countWhere = countConditions.length ? `WHERE ${countConditions.join(" AND ")}` : "";
  const totalResult = await countReq.query(`
    SELECT COUNT(1) AS total
    FROM dbo.tbl_prd_summary_new
    ${countWhere}
  `);

  const result = await request.query(`
    SELECT
      CONVERT(varchar(10), prd_date, 23) AS d,
      ${PLANT_EXPR} AS plant,
      prd_station AS line,
      ISNULL(material_code, '') AS materialCode,
      ISNULL(NULLIF(internal_name, ''), ISNULL(prd_type, material_code)) AS product,
      NULLIF(prd_size, '') AS size,
      ${ACTUAL_EXPR} AS actualTon,
      ${TARGET_EXPR} AS targetTon,
      ${GRADE_B_EXPR} AS scrapTon,
      ${REJECT_EXPR} AS rejectTon
    FROM dbo.tbl_prd_summary_new
    ${where}
    ORDER BY prd_date DESC, prd_station, material_code
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  const rows: DetailRow[] = result.recordset.map((row: Record<string, unknown>) => {
    const actualTon = Number(row.actualTon || 0);
    const targetTon = Number(row.targetTon || 0);
    const scrapTon = Number(row.scrapTon || 0);
    const rejectTon = Number(row.rejectTon || 0);
    const achievementPct = calcAchievementPct(actualTon, targetTon);
    return {
      date: String(row.d),
      plant: String(row.plant || "—"),
      department: null,
      line: String(row.line || "—"),
      shift: null,
      materialCode: String(row.materialCode || ""),
      product: String(row.product || ""),
      productGroup: null,
      size: row.size ? String(row.size) : null,
      grade: null,
      targetTon,
      actualTon,
      achievementPct,
      goodTon: actualTon,
      scrapTon,
      rejectTon,
      yieldPct: calcYieldPct(actualTon, scrapTon, rejectTon),
      downtimeMin: null,
      status: achievementStatus(achievementPct)
    };
  });

  return {
    rows,
    total: Number(totalResult.recordset[0]?.total || 0),
    page,
    pageSize
  };
}

export async function exportDetailExcel(filters: DashboardFilters) {
  const data = await getDetail({ ...filters, page: 1, pageSize: 5000 });
  const sheetRows = data.rows.map((r) => ({
    Date: r.date,
    Plant: r.plant,
    Line: r.line,
    MaterialCode: r.materialCode,
    Product: r.product,
    Size: r.size,
    TargetTon: r.targetTon,
    ActualTon: r.actualTon,
    AchievementPct: r.achievementPct,
    GoodTon: r.goodTon,
    GradeBTon: r.scrapTon,
    RejectTon: r.rejectTon,
    YieldPct: r.yieldPct,
    Status: r.status
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, "Production Detail");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
