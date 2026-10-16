import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultWindow,
  formatWindowHm,
  mergeWindows,
  parsePrdTime,
  toSqlDateTimeLocal,
  windowsToSqlPayload,
  type StationDayWindows
} from "./planWindow";

const D = "2026-10-15";
const D1 = "2026-10-16";

function hm(w: { start: Date; end: Date } | null) {
  if (!w) return null;
  return `${formatWindowHm(w.start)}-${formatWindowHm(w.end)}@${w.start.toISOString().slice(0, 10)}>${w.end.toISOString().slice(0, 10)}`;
}

describe("parsePrdTime (AC6)", () => {
  it("09:00-09:00 → d 09:00 to d+1 09:00", () => {
    const w = parsePrdTime("09:00-09:00", D)!;
    assert.equal(formatWindowHm(w.start), "09:00");
    assert.equal(formatWindowHm(w.end), "09:00");
    assert.equal(w.start.getFullYear(), 2026);
    assert.equal(w.start.getMonth(), 9);
    assert.equal(w.start.getDate(), 15);
    assert.equal(w.end.getDate(), 16);
  });

  it("22:00-09:00 overnight on plan day d", () => {
    const w = parsePrdTime("22:00-09:00", D)!;
    assert.equal(formatWindowHm(w.start), "22:00");
    assert.equal(w.start.getDate(), 15);
    assert.equal(formatWindowHm(w.end), "09:00");
    assert.equal(w.end.getDate(), 16);
  });

  it("22:00-03:00 + 03:00-09:00 merge to full night", () => {
    const a = parsePrdTime("22:00-03:00", D)!;
    const b = parsePrdTime("03:00-09:00", D)!;
    assert.equal(a.start.getDate(), 15);
    assert.equal(a.end.getDate(), 16);
    assert.equal(formatWindowHm(a.end), "03:00");
    // 03:00-09:00 is night-shift tail → both on d+1
    assert.equal(b.start.getDate(), 16);
    assert.equal(b.end.getDate(), 16);
    assert.equal(formatWindowHm(b.start), "03:00");
    assert.equal(formatWindowHm(b.end), "09:00");
    const merged = mergeWindows([a, b]);
    assert.equal(merged.length, 1);
    assert.equal(formatWindowHm(merged[0].start), "22:00");
    assert.equal(formatWindowHm(merged[0].end), "09:00");
    assert.equal(merged[0].start.getDate(), 15);
    assert.equal(merged[0].end.getDate(), 16);
  });

  it("09:00-13:00 + 17:00-09:00 keeps gap (two windows)", () => {
    const a = parsePrdTime("09:00-13:00", D)!;
    const b = parsePrdTime("17:00-09:00", D)!;
    const merged = mergeWindows([a, b]);
    assert.equal(merged.length, 2);
    assert.equal(formatWindowHm(merged[0].start), "09:00");
    assert.equal(formatWindowHm(merged[0].end), "13:00");
    assert.equal(formatWindowHm(merged[1].start), "17:00");
    assert.equal(formatWindowHm(merged[1].end), "09:00");
    assert.equal(merged[1].end.getDate(), 16);
  });

  it("21:00-9:00 tolerant single-digit hour", () => {
    const w = parsePrdTime("21:00-9:00", D)!;
    assert.equal(formatWindowHm(w.start), "21:00");
    assert.equal(formatWindowHm(w.end), "09:00");
    assert.equal(w.end.getDate(), 16);
  });

  it("08:00-17:00 stays on day d (legacy day shift)", () => {
    const w = parsePrdTime("08:00-17:00", D)!;
    assert.equal(w.start.getDate(), 15);
    assert.equal(w.end.getDate(), 15);
    assert.equal(formatWindowHm(w.start), "08:00");
    assert.equal(formatWindowHm(w.end), "17:00");
  });

  it("NULL / blank / garbage → null", () => {
    assert.equal(parsePrdTime(null, D), null);
    assert.equal(parsePrdTime(undefined, D), null);
    assert.equal(parsePrdTime("", D), null);
    assert.equal(parsePrdTime("nope", D), null);
  });

  it("defaultWindow is d 09:00 → d+1 09:00", () => {
    const w = defaultWindow(D);
    assert.equal(formatWindowHm(w.start), "09:00");
    assert.equal(formatWindowHm(w.end), "09:00");
    assert.equal(w.start.getDate(), 15);
    assert.equal(w.end.getDate(), 16);
    assert.ok(hm(w));
    assert.equal(D1.length, 10);
  });
});

describe("toSqlDateTimeLocal", () => {
  it("emits ISO yyyy-MM-ddTHH:mm:ss (no space)", () => {
    const w = parsePrdTime("22:00-09:00", D)!;
    assert.match(toSqlDateTimeLocal(w.start), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.match(toSqlDateTimeLocal(w.end), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.equal(toSqlDateTimeLocal(w.start), "2026-10-15T22:00:00");
    assert.equal(toSqlDateTimeLocal(w.end), "2026-10-16T09:00:00");
  });
});

describe("windowsToSqlPayload merge across adjacent days", () => {
  it("merges day-d overnight with overlapping day-d+1 early shift", () => {
    // d: 09:00→d+1 09:00 overlaps d+1: 08:00-17:00 on the morning of d+1
    const stationDays: StationDayWindows[] = [
      {
        station: "RMD7",
        planDate: D,
        windows: [parsePrdTime("09:00-09:00", D)!],
        windowSource: "plan"
      },
      {
        station: "RMD7",
        planDate: D1,
        windows: [parsePrdTime("08:00-17:00", D1)!],
        windowSource: "plan"
      }
    ];
    const { json, meta, boundStart, boundEnd } = windowsToSqlPayload(stationDays);
    const rows = JSON.parse(json) as Array<{ station: string; winStart: string; winEnd: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].station, "RMD7");
    assert.equal(rows[0].winStart, "2026-10-15T09:00:00");
    assert.equal(rows[0].winEnd, "2026-10-16T17:00:00");
    assert.equal(meta.windows.length, 1);
    assert.match(boundStart, /T/);
    assert.match(boundEnd, /T/);
  });

  it("keeps gap across days when windows do not touch", () => {
    const stationDays: StationDayWindows[] = [
      {
        station: "RMD7",
        planDate: D,
        windows: [parsePrdTime("09:00-13:00", D)!],
        windowSource: "plan"
      },
      {
        station: "RMD7",
        planDate: D1,
        windows: [parsePrdTime("08:00-17:00", D1)!],
        windowSource: "plan"
      }
    ];
    const rows = JSON.parse(windowsToSqlPayload(stationDays).json) as Array<{
      winStart: string;
      winEnd: string;
    }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].winStart, "2026-10-15T09:00:00");
    assert.equal(rows[0].winEnd, "2026-10-15T13:00:00");
    assert.equal(rows[1].winStart, "2026-10-16T08:00:00");
    assert.equal(rows[1].winEnd, "2026-10-16T17:00:00");
  });
});
