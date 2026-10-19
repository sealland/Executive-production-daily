import { getDowntimePool, getDowntimeTable, isDowntimeConfigured, sql } from "@/lib/db/downtime";
import {
  CLIPPED_MINUTES_SQL,
  attachPlanWindows,
  getPlanWindowsForDate,
  windowsToSqlPayload,
  type PlanWindowMeta
} from "@/lib/services/planWindow";

export type ReportCategory = "mechanical" | "electrical" | "process" | "changeover" | "planned" | "quality" | "others";

export interface DowntimeDetailRow {
  plant: "rmd7" | "rmd8" | "msm";
  plantLabel: "RMD7" | "RMD8" | "MSM";
  category: ReportCategory;
  cause: string;
  duration: number;
  occ: number;
}

export interface DowntimeDetailResult {
  rows: DowntimeDetailRow[];
  windowSource: PlanWindowMeta["windowSource"];
  windows: PlanWindowMeta["windows"];
}

const STATION_TO_PLANT: Record<string, { plant: "rmd7" | "rmd8" | "msm"; plantLabel: "RMD7" | "RMD8" | "MSM" }> = {
  RMD7: { plant: "rmd7", plantLabel: "RMD7" },
  RMD8: { plant: "rmd8", plantLabel: "RMD8" },
  SMD: { plant: "msm", plantLabel: "MSM" }
};

const CODE_MAP: Record<string, ReportCategory> = {
  MM: "mechanical",
  M: "mechanical",
  EE: "electrical",
  EM: "electrical",
  E: "electrical",
  PD: "process",
  P: "process",
  PP: "process",
  SETUP: "changeover",
  "SET UP": "changeover",
  "CHANGE SIZE": "changeover",
  PM: "planned",
  QA: "quality",
  UTD: "others",
  IT: "others",
  OTHER: "others",
  TEST: "others"
};

function mapCategory(group: string | null | undefined): ReportCategory {
  if (!group) return "others";
  return CODE_MAP[group.trim().toUpperCase()] || "others";
}

export interface LongDowntimeEvent {
  cause: string;
  minutes: number;
  startTime: string | null; // HH:MM
}

const PLANT_TO_STATION: Record<string, string> = { RMD7: "RMD7", RMD8: "RMD8", MSM: "SMD" };

// Single downtime events of at least `minMinutes` (after plan-window clip) for one plant.
// Used as the default plant highlight when nobody has written one yet.
export async function getLongDowntimeEvents(
  reportDate: string,
  plant: string,
  minMinutes = 120,
  limit = 3
): Promise<LongDowntimeEvent[]> {
  const station = PLANT_TO_STATION[plant.toUpperCase()];
  if (!station || !isDowntimeConfigured()) return [];

  const stationDays = await getPlanWindowsForDate(reportDate, [station]);
  const { rows, boundStart, boundEnd } = windowsToSqlPayload(stationDays);

  const pool = await getDowntimePool();
  const table = getDowntimeTable();
  const request = pool.request();
  const windowsSql = attachPlanWindows(request, sql, rows);
  request.input("boundStart", sql.NVarChar, boundStart);
  request.input("boundEnd", sql.NVarChar, boundEnd);
  request.input("station", sql.NVarChar, station);
  request.input("minMinutes", sql.Int, minMinutes);
  request.input("limit", sql.Int, Math.min(Math.max(1, limit), 10));

  const result = await request.query(`
    SELECT TOP (@limit)
      problem,
      clippedMinutes AS minutes,
      startTime
    FROM (
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(d.Problem)), ''), ISNULL(d.Cause, N'ไม่ระบุ')) AS problem,
        CONVERT(varchar(5), d.StartTime, 108) AS startTime,
        SUM(${CLIPPED_MINUTES_SQL}) AS clippedMinutes
      FROM ${table} d
      INNER JOIN ${windowsSql}
        ON LTRIM(RTRIM(d.Station)) = w.station
       AND d.StartTime < w.winEnd
       AND DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) > w.winStart
      WHERE d.StartTime >= CONVERT(datetime, @boundStart)
        AND d.StartTime < CONVERT(datetime, @boundEnd)
        AND LTRIM(RTRIM(d.Station)) = @station
        AND ${CLIPPED_MINUTES_SQL} > 0
      GROUP BY
        d.StartTime,
        d.Minute,
        d.Problem,
        d.Cause
    ) clipped
    WHERE clippedMinutes >= @minMinutes
    ORDER BY clippedMinutes DESC
  `);

  return (result.recordset as Array<{ problem: string; minutes: number; startTime: string | null }>).map((row) => ({
    cause: row.problem,
    minutes: Number(row.minutes || 0),
    startTime: row.startTime
  }));
}

export async function getDowntimeDetail(reportDate: string): Promise<DowntimeDetailResult> {
  const stationDays = await getPlanWindowsForDate(reportDate);
  const { rows, boundStart, boundEnd, meta } = windowsToSqlPayload(stationDays);

  if (!isDowntimeConfigured()) {
    return { rows: [], windowSource: meta.windowSource, windows: meta.windows };
  }

  const pool = await getDowntimePool();
  const table = getDowntimeTable();
  const request = pool.request();
  const windowsSql = attachPlanWindows(request, sql, rows);
  request.input("boundStart", sql.NVarChar, boundStart);
  request.input("boundEnd", sql.NVarChar, boundEnd);

  // Aggregate clipped minutes in SQL (bounded by distinct station/group/problem).
  const result = await request.query(`
    SELECT
      LTRIM(RTRIM(d.Station)) AS station,
      LTRIM(RTRIM(ISNULL(d.[Group], ''))) AS grp,
      ISNULL(NULLIF(LTRIM(RTRIM(d.Problem)), ''), ISNULL(d.Cause, N'ไม่ระบุ')) AS problem,
      SUM(${CLIPPED_MINUTES_SQL}) AS minutes,
      COUNT(*) AS occ
    FROM ${table} d
    INNER JOIN ${windowsSql}
      ON LTRIM(RTRIM(d.Station)) = w.station
     AND d.StartTime < w.winEnd
     AND DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) > w.winStart
    WHERE d.StartTime >= CONVERT(datetime, @boundStart)
      AND d.StartTime < CONVERT(datetime, @boundEnd)
      AND LTRIM(RTRIM(d.Station)) IN ('RMD7', 'RMD8', 'SMD')
      AND ${CLIPPED_MINUTES_SQL} > 0
    GROUP BY
      LTRIM(RTRIM(d.Station)),
      LTRIM(RTRIM(ISNULL(d.[Group], ''))),
      ISNULL(NULLIF(LTRIM(RTRIM(d.Problem)), ''), ISNULL(d.Cause, N'ไม่ระบุ'))
  `);

  const bucket = new Map<string, DowntimeDetailRow>();
  for (const row of result.recordset as Array<{
    station: string;
    grp: string;
    problem: string;
    minutes: number;
    occ: number;
  }>) {
    const stationInfo = STATION_TO_PLANT[row.station];
    if (!stationInfo) continue;
    const category = mapCategory(row.grp);
    const key = row.station + "|" + category + "|" + row.problem;
    const existing = bucket.get(key);
    const minutes = Number(row.minutes || 0);
    const occ = Number(row.occ || 0);
    if (existing) {
      existing.duration += minutes;
      existing.occ += occ;
    } else {
      bucket.set(key, {
        plant: stationInfo.plant,
        plantLabel: stationInfo.plantLabel,
        category,
        cause: row.problem,
        duration: minutes,
        occ
      });
    }
  }

  return {
    rows: [...bucket.values()].sort((a, b) => b.duration - a.duration),
    windowSource: meta.windowSource,
    windows: meta.windows
  };
}
