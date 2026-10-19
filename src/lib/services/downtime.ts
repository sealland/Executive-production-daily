import {
  getDowntimePool,
  getDowntimeTable,
  isDowntimeConfigured,
  sql
} from "@/lib/db/downtime";
import { mapDowntimeCategory } from "@/lib/constants/downtime-groups";
import { downtimeScopeNote } from "@/lib/constants/line-machine";
import { buildDowntimeConditions } from "@/lib/query/downtimeFilters";
import { previousDay, resolvePeriod } from "@/lib/calc/periods";
import {
  CLIPPED_MINUTES_SQL,
  attachPlanWindows,
  getPlanWindowsForRange,
  windowsToSqlPayload
} from "@/lib/services/planWindow";
import { downtimeStationsForPlant } from "@/lib/constants/plants";
import type {
  DashboardFilters,
  DowntimeSummary,
  LossRow
} from "@/lib/types/production";

function stationsForFilters(filters: DashboardFilters): string[] {
  if (filters.plant) {
    const stations = downtimeStationsForPlant(filters.plant);
    if (stations.length) return stations;
  }
  return ["RMD7", "RMD8", "SMD"];
}

async function sumClippedMinutes(
  table: string,
  filters: DashboardFilters,
  stationDays: Awaited<ReturnType<typeof getPlanWindowsForRange>>
): Promise<number> {
  if (!stationDays.length) return 0;
  const { rows, boundStart, boundEnd } = windowsToSqlPayload(stationDays);
  const pool = await getDowntimePool();
  const request = pool.request();
  const windowsSql = attachPlanWindows(request, sql, rows);
  request.input("boundStart", sql.NVarChar, boundStart);
  request.input("boundEnd", sql.NVarChar, boundEnd);
  const filterConds = buildDowntimeConditions(request, filters, "d");
  const extraSql = filterConds.length ? `AND ${filterConds.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT ISNULL(SUM(clippedMinutes), 0) AS minutes
    FROM (
      SELECT ${CLIPPED_MINUTES_SQL} AS clippedMinutes
      FROM ${table} d
      INNER JOIN ${windowsSql}
        ON LTRIM(RTRIM(d.Station)) = w.station
       AND d.StartTime < w.winEnd
       AND DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) > w.winStart
      WHERE d.StartTime >= CONVERT(datetime, @boundStart)
        AND d.StartTime < CONVERT(datetime, @boundEnd)
        AND ${CLIPPED_MINUTES_SQL} > 0
        ${extraSql}
    ) clipped
  `);
  return Number(result.recordset[0]?.minutes || 0);
}

export async function getDowntimeSummary(filters: DashboardFilters): Promise<DowntimeSummary> {
  if (!isDowntimeConfigured()) {
    return {
      todayMinutes: 0,
      previousDayMinutes: 0,
      diffMinutes: 0,
      groups: [],
      reasons: [],
      asOfDate: null,
      scopeNote: null
    };
  }

  const period = resolvePeriod(filters);
  const today = period.anchorDate;
  const prev = previousDay(today);
  const pool = await getDowntimePool();
  const table = getDowntimeTable();
  const stations = stationsForFilters(filters);

  // One plan fetch covering prev + today + full report range (no per-day query loop)
  const rangeStart = period.startDate < prev ? period.startDate : prev;
  const rangeEnd = period.endDate > today ? period.endDate : today;
  const allStationDays = await getPlanWindowsForRange(rangeStart, rangeEnd, stations);

  const todayDays = allStationDays.filter((s) => s.planDate === today);
  const prevDays = allStationDays.filter((s) => s.planDate === prev);
  const rangeDays = allStationDays.filter(
    (s) => s.planDate >= period.startDate && s.planDate <= period.endDate
  );

  const todayMeta = windowsToSqlPayload(todayDays);

  const [todayMinutes, previousDayMinutes] = await Promise.all([
    sumClippedMinutes(table, filters, todayDays),
    sumClippedMinutes(table, filters, prevDays)
  ]);

  const { rows, boundStart, boundEnd } = windowsToSqlPayload(rangeDays);
  const rangeReq = pool.request();
  const rangeWindowsSql = attachPlanWindows(rangeReq, sql, rows);
  rangeReq.input("boundStart", sql.NVarChar, boundStart);
  rangeReq.input("boundEnd", sql.NVarChar, boundEnd);
  const rangeConds = buildDowntimeConditions(rangeReq, filters, "d");
  const rangeExtra = rangeConds.length ? `AND ${rangeConds.join(" AND ")}` : "";

  const groupResult = await rangeReq.query(`
    SELECT downtimeGroup, ISNULL(SUM(clippedMinutes), 0) AS minutes
    FROM (
      SELECT
        d.[Group] AS downtimeGroup,
        ${CLIPPED_MINUTES_SQL} AS clippedMinutes
      FROM ${table} d
      INNER JOIN ${rangeWindowsSql}
        ON LTRIM(RTRIM(d.Station)) = w.station
       AND d.StartTime < w.winEnd
       AND DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) > w.winStart
      WHERE d.StartTime >= CONVERT(datetime, @boundStart)
        AND d.StartTime < CONVERT(datetime, @boundEnd)
        AND ${CLIPPED_MINUTES_SQL} > 0
        ${rangeExtra}
    ) clipped
    GROUP BY downtimeGroup
  `);

  const reasonReq = pool.request();
  const reasonWindowsSql = attachPlanWindows(reasonReq, sql, rows);
  reasonReq.input("boundStart", sql.NVarChar, boundStart);
  reasonReq.input("boundEnd", sql.NVarChar, boundEnd);
  const reasonConds = buildDowntimeConditions(reasonReq, filters, "d");
  const reasonExtra = reasonConds.length ? `AND ${reasonConds.join(" AND ")}` : "";

  const reasonResult = await reasonReq.query(`
    SELECT TOP 30
      downtimeGroup,
      problem,
      ISNULL(SUM(clippedMinutes), 0) AS minutes,
      COUNT(*) AS cnt
    FROM (
      SELECT
        d.[Group] AS downtimeGroup,
        ISNULL(NULLIF(LTRIM(RTRIM(d.Problem)), ''), ISNULL(d.Cause, 'ไม่ระบุ')) AS problem,
        ${CLIPPED_MINUTES_SQL} AS clippedMinutes
      FROM ${table} d
      INNER JOIN ${reasonWindowsSql}
        ON LTRIM(RTRIM(d.Station)) = w.station
       AND d.StartTime < w.winEnd
       AND DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) > w.winStart
      WHERE d.StartTime >= CONVERT(datetime, @boundStart)
        AND d.StartTime < CONVERT(datetime, @boundEnd)
        AND ${CLIPPED_MINUTES_SQL} > 0
        ${reasonExtra}
    ) clipped
    GROUP BY downtimeGroup, problem
    ORDER BY SUM(clippedMinutes) DESC
  `);

  const categoryMap = new Map<string, number>();
  for (const row of groupResult.recordset) {
    const category = mapDowntimeCategory(row.downtimeGroup);
    categoryMap.set(category, (categoryMap.get(category) || 0) + Number(row.minutes || 0));
  }

  const sorted = [...categoryMap.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  const total = sorted.reduce((sum, r) => sum + r.minutes, 0) || 1;
  let cumulative = 0;
  const groups = sorted.map((row) => {
    const contributionPct = (row.minutes / total) * 100;
    cumulative += contributionPct;
    return {
      category: row.category,
      minutes: row.minutes,
      contributionPct,
      cumulativePct: cumulative
    };
  });

  const reasons = reasonResult.recordset.map((row: {
    downtimeGroup: string;
    problem: string;
    minutes: number;
    cnt: number;
  }) => ({
    category: mapDowntimeCategory(row.downtimeGroup),
    problem: String(row.problem || "ไม่ระบุ"),
    minutes: Number(row.minutes || 0),
    count: Number(row.cnt || 0)
  }));

  return {
    todayMinutes,
    previousDayMinutes,
    diffMinutes: todayMinutes - previousDayMinutes,
    groups,
    reasons,
    asOfDate: today,
    scopeNote: downtimeScopeNote(filters.plant, filters.line),
    windowSource: todayMeta.meta.windowSource,
    windows: todayMeta.meta.windows
  };
}

export async function getProductionLoss(): Promise<LossRow[]> {
  // Loss→ton conversion still unavailable; windows shared via downtime-detail / summary paths.
  // Keep placeholders so callers stay stable (no separate downtime query here).
  return [
    {
      type: "Downtime Loss",
      ton: null,
      available: false,
      note: "ยังไม่มีอัตราผลิต (ตัน/ชม.) สำหรับแปลงนาทีเป็นตัน"
    },
    {
      type: "Quality Loss",
      ton: null,
      available: false,
      note: "ใช้ prd_b / prd_r ได้ในเฟสถัดไปเมื่อยืนยันสูตร Loss"
    },
    {
      type: "Speed Loss",
      ton: null,
      available: false
    },
    {
      type: "Changeover Loss",
      ton: null,
      available: false
    },
    {
      type: "Other Loss",
      ton: null,
      available: false
    }
  ];
}
