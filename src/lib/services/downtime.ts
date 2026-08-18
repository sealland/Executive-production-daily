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
import type {
  DashboardFilters,
  DowntimeSummary,
  LossRow
} from "@/lib/types/production";

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

  const dayReq = pool.request();
  dayReq.input("today", sql.Date, today);
  dayReq.input("prev", sql.Date, prev);
  const dayConds = buildDowntimeConditions(dayReq, filters);
  const dayExtra = dayConds.length ? `AND ${dayConds.join(" AND ")}` : "";

  const dayResult = await dayReq.query(`
    SELECT
      SUM(CASE WHEN CONVERT(date, StartTime) = @today THEN Minute ELSE 0 END) AS todayMinutes,
      SUM(CASE WHEN CONVERT(date, StartTime) = @prev THEN Minute ELSE 0 END) AS previousDayMinutes
    FROM ${table}
    WHERE CONVERT(date, StartTime) IN (@today, @prev)
    ${dayExtra}
  `);

  const rangeReq = pool.request();
  const startDate = period.startDate;
  const endDate = period.endDate;
  rangeReq.input("startDate", sql.Date, startDate);
  rangeReq.input("endDate", sql.Date, endDate);
  const rangeConds = buildDowntimeConditions(rangeReq, filters);
  rangeConds.unshift("CONVERT(date, StartTime) >= @startDate");
  rangeConds.unshift("CONVERT(date, StartTime) <= @endDate");

  const groupResult = await rangeReq.query(`
    SELECT [Group] AS downtimeGroup, ISNULL(SUM(Minute), 0) AS minutes
    FROM ${table}
    WHERE ${rangeConds.join(" AND ")}
    GROUP BY [Group]
  `);

  const reasonReq = pool.request();
  reasonReq.input("startDate", sql.Date, startDate);
  reasonReq.input("endDate", sql.Date, endDate);
  const reasonConds = buildDowntimeConditions(reasonReq, filters);
  reasonConds.unshift("CONVERT(date, StartTime) >= @startDate");
  reasonConds.unshift("CONVERT(date, StartTime) <= @endDate");

  const reasonResult = await reasonReq.query(`
    SELECT TOP 30
      [Group] AS downtimeGroup,
      ISNULL(NULLIF(LTRIM(RTRIM(Problem)), ''), ISNULL(Cause, 'ไม่ระบุ')) AS problem,
      ISNULL(SUM(Minute), 0) AS minutes,
      COUNT(*) AS cnt
    FROM ${table}
    WHERE ${reasonConds.join(" AND ")}
    GROUP BY [Group], ISNULL(NULLIF(LTRIM(RTRIM(Problem)), ''), ISNULL(Cause, 'ไม่ระบุ'))
    ORDER BY SUM(Minute) DESC
  `);

  const todayMinutes = Number(dayResult.recordset[0]?.todayMinutes || 0);
  const previousDayMinutes = Number(dayResult.recordset[0]?.previousDayMinutes || 0);

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
    scopeNote: downtimeScopeNote(filters.plant, filters.line)
  };
}

export async function getProductionLoss(): Promise<LossRow[]> {
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
