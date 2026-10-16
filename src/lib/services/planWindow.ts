import { getCeoPool, isCeoConfigured, sql } from "@/lib/db/ceo";

export type TimeWindow = { start: Date; end: Date };

export type StationDayWindows = {
  station: string;
  planDate: string;
  windows: TimeWindow[];
  windowSource: "plan" | "default";
};

export type PlanWindowMeta = {
  windowSource: "plan" | "default" | "mixed";
  windows: Array<{ station: string; start: string; end: string }>;
};

const PLAN_STATIONS = ["RMD7", "RMD8", "SMD"] as const;
const DEFAULT_START_HOUR = 9;

/** Local calendar date parts from yyyy-MM-dd (no UTC shift). */
function dateParts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function addDaysStr(dateStr: string, days: number): string {
  const { y, m, d } = dateParts(dateStr);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Build a local Date on yyyy-MM-dd at HH:MM. */
export function atLocal(dateStr: string, hours: number, minutes: number): Date {
  const { y, m, d } = dateParts(dateStr);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

export function defaultWindow(planDate: string): TimeWindow {
  return {
    start: atLocal(planDate, DEFAULT_START_HOUR, 0),
    end: atLocal(addDaysStr(planDate, 1), DEFAULT_START_HOUR, 0)
  };
}

/**
 * Parse a single prdtime token for plan day `d`.
 * Tolerates H:MM / HH:M. Returns null when blank or unparseable.
 */
export function parsePrdTime(prdtime: string | null | undefined, planDate: string): TimeWindow | null {
  if (prdtime == null) return null;
  const raw = String(prdtime).trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2}):(\d{1,2})\s*-\s*(\d{1,2}):(\d{1,2})$/);
  if (!m) {
    console.warn(`[planWindow] unparseable prdtime "${raw}" for ${planDate}`);
    return null;
  }

  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em) ||
    sh > 23 ||
    eh > 23 ||
    sm > 59 ||
    em > 59
  ) {
    console.warn(`[planWindow] out-of-range prdtime "${raw}" for ${planDate}`);
    return null;
  }

  // Day assignment for start (and end before overnight adjust):
  // - start ≥ 09:00 → day d
  // - start < 09:00 and end ≤ 09:00 → day d+1 (night-shift tail e.g. 03:00-09:00)
  // - otherwise → day d (e.g. 08:00-17:00)
  const endMinutes = eh * 60 + em;
  const startMinutes = sh * 60 + sm;
  const nine = 9 * 60;
  let startDay = planDate;
  if (startMinutes < nine && endMinutes <= nine) {
    startDay = addDaysStr(planDate, 1);
  }

  let start = atLocal(startDay, sh, sm);
  let end = atLocal(startDay, eh, em);

  // end ≤ start → end is the next calendar day after start
  if (end.getTime() <= start.getTime()) {
    const endDay = addDaysStr(
      `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
      1
    );
    end = atLocal(endDay, eh, em);
  }

  return { start, end };
}

/** Merge overlapping / touching windows (same station/day). */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  if (!windows.length) return [];
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: TimeWindow[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = new Date(cur.end);
    } else {
      out.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return out;
}

export function formatWindowIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ISO local wall-clock for SQL CONVERT — language/DATEFORMAT independent. */
export function toSqlDateTimeLocal(d: Date): string {
  return formatWindowIso(d);
}

export function formatWindowHm(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PlanRow = { station: string; d: Date | string; prdtime: string | null };

function planDateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  // mssql Date often arrives as UTC midnight for a calendar date — use UTC parts
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Resolve windows per station for each plan day in [startDate, endDate].
 * One parameterized SELECT (no per-day loop). Holidays / missing → default 09:00→09:00.
 */
export async function getPlanWindowsForRange(
  startDate: string,
  endDate: string,
  stations: readonly string[] = PLAN_STATIONS
): Promise<StationDayWindows[]> {
  const stationList = stations.length ? [...stations] : [...PLAN_STATIONS];
  const days: string[] = [];
  for (let cur = startDate; cur <= endDate; cur = addDaysStr(cur, 1)) days.push(cur);

  const byKey = new Map<string, TimeWindow[]>(); // station|date → windows from plan

  if (isCeoConfigured()) {
    try {
      const pool = await getCeoPool();
      const request = pool.request();
      request.input("startDate", sql.Date, startDate);
      request.input("endDate", sql.Date, endDate);
      stationList.forEach((s, i) => request.input(`st${i}`, sql.NVarChar, s));
      const inList = stationList.map((_, i) => `@st${i}`).join(", ");

      // plan_all is a view on the CEO pool database (CEO_REPORT). Columns only as needed.
      const result = await request.query(`
        SELECT station, d, prdtime
        FROM dbo.plan_all
        WHERE d >= @startDate AND d < DATEADD(day, 1, @endDate)
          AND LTRIM(RTRIM(station)) IN (${inList})
      `);

      for (const row of result.recordset as PlanRow[]) {
        const station = String(row.station || "").trim().toUpperCase();
        if (!stationList.includes(station)) continue;
        const dKey = planDateKey(row.d);
        const mapKey = `${station}|${dKey}`;
        const parsed = parsePrdTime(row.prdtime, dKey);
        if (!parsed) continue;
        const list = byKey.get(mapKey) || [];
        list.push(parsed);
        byKey.set(mapKey, list);
      }
    } catch (err) {
      console.warn("[planWindow] plan_all query failed; using default windows", err);
    }
  }

  const out: StationDayWindows[] = [];
  for (const day of days) {
    for (const station of stationList) {
      const mapKey = `${station}|${day}`;
      const fromPlan = byKey.get(mapKey);
      if (fromPlan && fromPlan.length) {
        out.push({
          station,
          planDate: day,
          windows: mergeWindows(fromPlan),
          windowSource: "plan"
        });
      } else {
        // No parseable prdtime (or no rows / CEO down) → fallback 09:00 → next 09:00
        out.push({
          station,
          planDate: day,
          windows: [defaultWindow(day)],
          windowSource: "default"
        });
      }
    }
  }
  return out;
}

export async function getPlanWindowsForDate(
  reportDate: string,
  stations: readonly string[] = PLAN_STATIONS
): Promise<StationDayWindows[]> {
  return getPlanWindowsForRange(reportDate, reportDate, stations);
}

/** Flatten station-day windows into SQL OPENJSON payload + outer StartTime bounds. */
export function windowsToSqlPayload(stationDays: StationDayWindows[]): {
  json: string;
  /** Local wall-clock strings for SQL CONVERT — avoids mssql useUTC shifting. */
  boundStart: string;
  boundEnd: string;
  meta: PlanWindowMeta;
} {
  const flat: Array<{ station: string; winStart: string; winEnd: string }> = [];
  const metaWindows: PlanWindowMeta["windows"] = [];
  const sources = new Set<"plan" | "default">();
  let boundStart: Date | null = null;
  let boundEnd: Date | null = null;

  // Merge per station across adjacent plan days so overnight windows that overlap
  // the next day's early shift are not double-counted in the JOIN.
  const byStation = new Map<string, TimeWindow[]>();
  for (const sd of stationDays) {
    sources.add(sd.windowSource);
    const list = byStation.get(sd.station) || [];
    for (const w of sd.windows) {
      list.push({ start: new Date(w.start), end: new Date(w.end) });
    }
    byStation.set(sd.station, list);
  }

  for (const [station, windows] of byStation) {
    for (const w of mergeWindows(windows)) {
      flat.push({
        station,
        winStart: toSqlDateTimeLocal(w.start),
        winEnd: toSqlDateTimeLocal(w.end)
      });
      metaWindows.push({
        station,
        start: formatWindowIso(w.start),
        end: formatWindowIso(w.end)
      });
      if (!boundStart || w.start < boundStart) boundStart = new Date(w.start);
      if (!boundEnd || w.end > boundEnd) boundEnd = new Date(w.end);
    }
  }

  if (!flat.length || !boundStart || !boundEnd) {
    const fallback = defaultWindow(new Date().toISOString().slice(0, 10));
    flat.push({
      station: "RMD7",
      winStart: toSqlDateTimeLocal(fallback.start),
      winEnd: toSqlDateTimeLocal(fallback.end)
    });
    boundStart = fallback.start;
    boundEnd = fallback.end;
  }

  // Allow events that started shortly before a window but overlap it (clip in SQL)
  const boundStartWide = new Date(boundStart.getTime() - 24 * 60 * 60 * 1000);

  const windowSource: PlanWindowMeta["windowSource"] =
    sources.size === 1 ? [...sources][0]! : "mixed";

  return {
    json: JSON.stringify(flat),
    boundStart: toSqlDateTimeLocal(boundStartWide),
    boundEnd: toSqlDateTimeLocal(boundEnd),
    meta: { windowSource, windows: metaWindows }
  };
}

/** SQL fragment: clipped overlap minutes between Downtimes row alias `d` and window `w`. */
export const CLIPPED_MINUTES_SQL = `
  DATEDIFF(
    minute,
    CASE WHEN d.StartTime > w.winStart THEN d.StartTime ELSE w.winStart END,
    CASE
      WHEN DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime) < w.winEnd
      THEN DATEADD(minute, ISNULL(d.Minute, 0), d.StartTime)
      ELSE w.winEnd
    END
  )
`.trim();

export const WINDOWS_OPENJSON_SQL = `
  OPENJSON(@windowsJson)
  WITH (
    station nvarchar(32) '$.station',
    winStart datetime '$.winStart',
    winEnd datetime '$.winEnd'
  )
`.trim();

export { PLAN_STATIONS };
