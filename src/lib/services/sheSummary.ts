import { getCeoPool, sql } from "@/lib/db/ceo";
import { SHE_CARD_PLANTS } from "@/lib/services/sheStatus";
import type { ShePlantSummary, SheSummaryResponse } from "@/lib/types/she";

export { SHE_CARD_PLANTS };

/** SQL for by-plant SHE cards (SQL Server 2012). Parameters: @asOf, @ytdStart, @p1, @p2, @p3. */
export const SHE_BY_PLANT_SUMMARY_SQL = `
WITH base AS (
  SELECT plant, occurred_date, kpi_category, incident_no, detail_short
  FROM dbo.tbl_she_incident_xls
  WHERE occurred_date <= @asOf
    AND plant IN (@p1, @p2, @p3)
),
latest_all AS (
  SELECT
    plant,
    CONVERT(varchar(10), occurred_date, 23) AS latest_date,
    kpi_category AS latest_category,
    LEFT(detail_short, 300) AS latest_detail_short,
    ROW_NUMBER() OVER (PARTITION BY plant ORDER BY occurred_date DESC, incident_no DESC) AS rn
  FROM base
),
last_injury AS (
  SELECT
    plant,
    CONVERT(varchar(10), occurred_date, 23) AS last_injury_date,
    kpi_category AS last_injury_category,
    ROW_NUMBER() OVER (PARTITION BY plant ORDER BY occurred_date DESC, incident_no DESC) AS rn
  FROM base
  WHERE kpi_category IN (N'LTI', N'TRI', N'First Aid')
),
last_lti_tri AS (
  SELECT
    plant,
    CONVERT(varchar(10), occurred_date, 23) AS last_lti_tri_date,
    kpi_category AS last_lti_tri_category,
    ROW_NUMBER() OVER (PARTITION BY plant ORDER BY occurred_date DESC, incident_no DESC) AS rn
  FROM base
  WHERE kpi_category IN (N'LTI', N'TRI')
),
ytd_counts AS (
  SELECT plant, COUNT(*) AS ytd_count
  FROM dbo.tbl_she_incident_xls
  WHERE occurred_date >= @ytdStart AND occurred_date <= @asOf
    AND plant IN (@p1, @p2, @p3)
  GROUP BY plant
),
pd_ytd AS (
  SELECT plant, COUNT(*) AS pd_ytd_count
  FROM dbo.tbl_she_incident_xls
  WHERE occurred_date >= @ytdStart AND occurred_date <= @asOf
    AND plant IN (@p1, @p2, @p3)
    AND kpi_category = N'PD'
  GROUP BY plant
)
SELECT
  plants.plant,
  ISNULL(y.ytd_count, 0) AS ytd_count,
  ISNULL(p.pd_ytd_count, 0) AS pd_ytd_count,
  li.last_injury_date,
  li.last_injury_category,
  lt.last_lti_tri_date,
  lt.last_lti_tri_category,
  la.latest_date,
  la.latest_category,
  la.latest_detail_short
FROM (
  SELECT @p1 AS plant
  UNION ALL SELECT @p2
  UNION ALL SELECT @p3
) AS plants
LEFT JOIN ytd_counts AS y ON y.plant = plants.plant
LEFT JOIN pd_ytd AS p ON p.plant = plants.plant
LEFT JOIN last_injury AS li ON li.plant = plants.plant AND li.rn = 1
LEFT JOIN last_lti_tri AS lt ON lt.plant = plants.plant AND lt.rn = 1
LEFT JOIN latest_all AS la ON la.plant = plants.plant AND la.rn = 1
ORDER BY plants.plant;
`;

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
    byPlant: [],
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

    const byPlantReq = pool
      .request()
      .input("asOf", sql.Date, asOf)
      .input("ytdStart", sql.Date, ytdStart)
      .input("p1", sql.NVarChar(20), SHE_CARD_PLANTS[0])
      .input("p2", sql.NVarChar(20), SHE_CARD_PLANTS[1])
      .input("p3", sql.NVarChar(20), SHE_CARD_PLANTS[2]);
    const byPlantResult = await byPlantReq.query(SHE_BY_PLANT_SUMMARY_SQL);

    const byPlant: ShePlantSummary[] = (byPlantResult.recordset as {
      plant: string;
      ytd_count: number;
      pd_ytd_count: number;
      last_injury_date: string | null;
      last_injury_category: string | null;
      last_lti_tri_date: string | null;
      last_lti_tri_category: string | null;
      latest_date: string | null;
      latest_category: string | null;
      latest_detail_short: string | null;
    }[]).map((r) => ({
      plant: r.plant,
      ytdCount: r.ytd_count,
      pdYtdCount: r.pd_ytd_count,
      lastInjuryDate: r.last_injury_date ? toIsoDate(r.last_injury_date) : null,
      lastInjuryCategory: r.last_injury_category,
      lastLtiTriDate: r.last_lti_tri_date ? toIsoDate(r.last_lti_tri_date) : null,
      lastLtiTriCategory: r.last_lti_tri_category,
      latestDate: r.latest_date ? toIsoDate(r.latest_date) : null,
      latestCategory: r.latest_category,
      latestDetailShort:
        r.latest_detail_short && String(r.latest_detail_short).trim()
          ? String(r.latest_detail_short).trim()
          : null
    }));

    return {
      asOfDate,
      lastImportedAt: meta.lastImportedAt,
      lastImportedBy: meta.lastImportedBy,
      dataThroughDate: meta.dataThroughDate,
      ytd,
      mtd,
      day,
      byPlantYtd: (plants.recordset as PlantRow[]).map((r) => ({ plant: r.plant, count: r.cnt })),
      byPlant,
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
