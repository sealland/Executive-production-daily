import { getCeoPool, sql } from "@/lib/db/ceo";
import type { SheSummaryResponse } from "@/lib/types/she";

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function yearBounds(asOfDate: string) {
  const y = asOfDate.slice(0, 4);
  return {
    ytdStart: `${y}-01-01`,
    mtdStart: `${y}-${asOfDate.slice(5, 7)}-01`,
    asOf: asOfDate
  };
}

export async function getImportMeta(): Promise<{
  lastImportedAt: string | null;
  lastImportedBy: string | null;
  dataThroughDate: string | null;
}> {
  const pool = await getCeoPool();
  try {
    const result = await pool.request().query(`
      SELECT
        (SELECT CONVERT(varchar(10), MAX(occurred_date), 23) FROM dbo.tbl_she_incident_xls) AS data_through_date,
        CONVERT(varchar(30), latest.imported_at, 126) AS last_imported_at,
        latest.imported_by AS last_imported_by
      FROM (
        SELECT TOP 1 imported_at, imported_by, id
        FROM dbo.tbl_she_incident_xls
        ORDER BY imported_at DESC, id DESC
      ) AS latest;
    `);
    const row = result.recordset[0] as {
      last_imported_at: string | null;
      last_imported_by: string | null;
      data_through_date: string | null;
    };
    return {
      lastImportedAt: row?.last_imported_at ?? null,
      lastImportedBy: row?.last_imported_by ?? null,
      dataThroughDate: row?.data_through_date ?? null
    };
  } catch {
    return { lastImportedAt: null, lastImportedBy: null, dataThroughDate: null };
  }
}

export async function getLatestLtiFromImport(asOfDate: string): Promise<{
  lastLtiDate: string | null;
  lastImportedAt: string | null;
}> {
  const pool = await getCeoPool();
  try {
    const result = await pool
      .request()
      .input("asOf", sql.Date, asOfDate)
      .query(`
      SELECT TOP 1
        CONVERT(varchar(10), occurred_date, 23) AS last_lti_date,
        CONVERT(varchar(30), imported_at, 126) AS last_imported_at
      FROM dbo.tbl_she_incident_xls
      WHERE kpi_category = N'LTI' AND occurred_date <= @asOf
      ORDER BY occurred_date DESC, incident_no DESC;
    `);
    const row = result.recordset[0] as { last_lti_date: string; last_imported_at: string } | undefined;
    return {
      lastLtiDate: row ? toIsoDate(row.last_lti_date) : null,
      lastImportedAt: row?.last_imported_at ?? null
    };
  } catch {
    return { lastLtiDate: null, lastImportedAt: null };
  }
}

type CountRow = { scope: string; kpi_category: string; cnt: number };
type PlantRow = { plant: string; cnt: number };
type MonthRow = { month_num: number; kpi_category: string; cnt: number };

export async function getSheSummary(asOfDate: string): Promise<SheSummaryResponse> {
  const { ytdStart, mtdStart, asOf } = yearBounds(asOfDate);
  const meta = await getImportMeta();
  const empty: SheSummaryResponse = {
    asOfDate,
    lastImportedAt: meta.lastImportedAt,
    lastImportedBy: meta.lastImportedBy,
    dataThroughDate: meta.dataThroughDate,
    ytd: {},
    mtd: {},
    day: {},
    byPlantYtd: [],
    byMonthYtd: [],
    latestIncidents: []
  };

  const pool = await getCeoPool();
  try {
    const counts = await pool
      .request()
      .input("ytdStart", sql.Date, ytdStart)
      .input("mtdStart", sql.Date, mtdStart)
      .input("asOf", sql.Date, asOf)
      .query(`
        SELECT scope, kpi_category, cnt FROM (
          SELECT N'ytd' AS scope, kpi_category, COUNT(*) AS cnt
          FROM dbo.tbl_she_incident_xls
          WHERE occurred_date >= @ytdStart AND occurred_date <= @asOf
          GROUP BY kpi_category
          UNION ALL
          SELECT N'mtd', kpi_category, COUNT(*)
          FROM dbo.tbl_she_incident_xls
          WHERE occurred_date >= @mtdStart AND occurred_date <= @asOf
          GROUP BY kpi_category
          UNION ALL
          SELECT N'day', kpi_category, COUNT(*)
          FROM dbo.tbl_she_incident_xls
          WHERE occurred_date = @asOf
          GROUP BY kpi_category
        ) AS c;
      `);

    const ytd: Record<string, number> = {};
    const mtd: Record<string, number> = {};
    const day: Record<string, number> = {};
    for (const row of counts.recordset as CountRow[]) {
      const bucket = row.scope === "ytd" ? ytd : row.scope === "mtd" ? mtd : day;
      bucket[row.kpi_category] = row.cnt;
    }

    const plants = await pool
      .request()
      .input("ytdStart", sql.Date, ytdStart)
      .input("asOf", sql.Date, asOf)
      .query(`
        SELECT plant, COUNT(*) AS cnt
        FROM dbo.tbl_she_incident_xls
        WHERE occurred_date >= @ytdStart AND occurred_date <= @asOf
        GROUP BY plant
        ORDER BY cnt DESC;
      `);

    const months = await pool
      .request()
      .input("ytdStart", sql.Date, ytdStart)
      .input("asOf", sql.Date, asOf)
      .query(`
        SELECT MONTH(occurred_date) AS month_num, kpi_category, COUNT(*) AS cnt
        FROM dbo.tbl_she_incident_xls
        WHERE occurred_date >= @ytdStart AND occurred_date <= @asOf
        GROUP BY MONTH(occurred_date), kpi_category
        ORDER BY month_num, kpi_category;
      `);

    const latest = await pool
      .request()
      .input("asOf", sql.Date, asOf)
      .query(`
        SELECT TOP (5)
          incident_no,
          CONVERT(varchar(10), occurred_date, 23) AS occurred_date,
          plant,
          kpi_category,
          severity,
          detail_short
        FROM dbo.tbl_she_incident_xls
        WHERE occurred_date <= @asOf
        ORDER BY occurred_date DESC, incident_no DESC;
      `);

    return {
      asOfDate,
      lastImportedAt: meta.lastImportedAt,
      lastImportedBy: meta.lastImportedBy,
      dataThroughDate: meta.dataThroughDate,
      ytd,
      mtd,
      day,
      byPlantYtd: (plants.recordset as PlantRow[]).map((r) => ({ plant: r.plant, count: r.cnt })),
      byMonthYtd: (months.recordset as MonthRow[]).map((r) => ({
        month: r.month_num,
        category: r.kpi_category,
        count: r.cnt
      })),
      latestIncidents: latest.recordset.map(
        (r: {
          incident_no: number;
          occurred_date: string;
          plant: string;
          kpi_category: string;
          severity: string | null;
          detail_short: string | null;
        }) => ({
          incidentNo: r.incident_no,
          occurredDate: toIsoDate(r.occurred_date),
          plant: r.plant,
          category: r.kpi_category,
          severity: r.severity,
          detailShort: r.detail_short
        })
      )
    };
  } catch {
    return empty;
  }
}
