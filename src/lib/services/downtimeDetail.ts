import { getDowntimePool, getDowntimeTable, isDowntimeConfigured, sql } from "@/lib/db/downtime";

export type ReportCategory = "mechanical" | "electrical" | "process" | "changeover" | "planned" | "quality" | "others";

export interface DowntimeDetailRow {
  plant: "rmd7" | "rmd8" | "msm";
  plantLabel: "RMD7" | "RMD8" | "MSM";
  category: ReportCategory;
  cause: string;
  duration: number;
  occ: number;
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

// Single downtime events of at least `minMinutes` for one plant on reportDate, longest first.
// Used as the default plant highlight when nobody has written one yet.
export async function getLongDowntimeEvents(
  reportDate: string,
  plant: string,
  minMinutes = 120,
  limit = 3
): Promise<LongDowntimeEvent[]> {
  const station = PLANT_TO_STATION[plant.toUpperCase()];
  if (!station || !isDowntimeConfigured()) return [];

  const pool = await getDowntimePool();
  const table = getDowntimeTable();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .input("station", sql.NVarChar, station)
    .input("minMinutes", sql.Int, minMinutes)
    .input("limit", sql.Int, Math.min(Math.max(1, limit), 10))
    .query(`
      SELECT TOP (@limit)
        ISNULL(NULLIF(LTRIM(RTRIM(Problem)), ''), ISNULL(Cause, N'ไม่ระบุ')) AS problem,
        Minute AS minutes,
        CONVERT(varchar(5), StartTime, 108) AS startTime
      FROM ${table}
      WHERE CONVERT(date, StartTime) = @d
        AND LTRIM(RTRIM(Station)) = @station
        AND Minute >= @minMinutes
      ORDER BY Minute DESC
    `);

  return (result.recordset as Array<{ problem: string; minutes: number; startTime: string | null }>).map((row) => ({
    cause: row.problem,
    minutes: Number(row.minutes || 0),
    startTime: row.startTime
  }));
}

export async function getDowntimeDetail(reportDate: string): Promise<DowntimeDetailRow[]> {
  if (!isDowntimeConfigured()) return [];

  const pool = await getDowntimePool();
  const table = getDowntimeTable();
  const result = await pool
    .request()
    .input("d", sql.Date, reportDate)
    .query(`
      SELECT
        LTRIM(RTRIM(Station)) AS station,
        LTRIM(RTRIM(ISNULL([Group], ''))) AS grp,
        ISNULL(NULLIF(LTRIM(RTRIM(Problem)), ''), ISNULL(Cause, N'ไม่ระบุ')) AS problem,
        Minute AS minutes
      FROM ${table}
      WHERE CONVERT(date, StartTime) = @d
        AND LTRIM(RTRIM(Station)) IN ('RMD7', 'RMD8', 'SMD')
    `);

  const bucket = new Map<string, DowntimeDetailRow>();
  for (const row of result.recordset as Array<{ station: string; grp: string; problem: string; minutes: number }>) {
    const stationInfo = STATION_TO_PLANT[row.station];
    if (!stationInfo) continue;
    const category = mapCategory(row.grp);
    const key = row.station + "|" + category + "|" + row.problem;
    const existing = bucket.get(key);
    if (existing) {
      existing.duration += Number(row.minutes || 0);
      existing.occ += 1;
    } else {
      bucket.set(key, {
        plant: stationInfo.plant,
        plantLabel: stationInfo.plantLabel,
        category,
        cause: row.problem,
        duration: Number(row.minutes || 0),
        occ: 1
      });
    }
  }

  return [...bucket.values()].sort((a, b) => b.duration - a.duration);
}
