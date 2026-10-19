import * as XLSX from "xlsx";
import { normalizeSheKpiCategory, normalizeShePlant } from "@/lib/services/sheMapping";

export const SHE_DATA_SHEET_EXACT = "DATA ";
export const SHE_MAX_DATA_ROWS = 500;
export const SHE_MAX_CELL_CHARS = 4000;
export const SHE_DETAIL_MAX_CHARS = 200;

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
  "ม.ค.": 1,
  "ก.พ.": 2,
  "มี.ค.": 3,
  "เม.ย.": 4,
  "พ.ค.": 5,
  "มิ.ย.": 6,
  "ก.ค.": 7,
  "ส.ค.": 8,
  "ก.ย.": 9,
  "ต.ค.": 10,
  "พ.ย.": 11,
  "ธ.ค.": 12
};

export type ParsedSheRow = {
  incidentNo: number;
  fileYear: number;
  occurredDate: string;
  plant: string;
  kpiCategory: string;
  rawType2: string | null;
  incidentCategory: string | null;
  severity: string | null;
  department: string | null;
  detailShort: string | null;
};

export type SheParseStats = {
  skippedInvalidDate: number[];
  excludedCount: number;
  excludedNos: number[];
  borderlineNos: number[];
  importedCount: number;
};

export type SheParseResult = {
  rows: ParsedSheRow[];
  stats: SheParseStats;
  fileYear: number | null;
};

function trimCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > SHE_MAX_CELL_CHARS ? s.slice(0, SHE_MAX_CELL_CHARS) : s;
}

function isDateCellEmpty(value: unknown): boolean {
  if (value == null) return true;
  return String(value).trim() === "";
}

function isDateRowBlank(
  line: (string | number | null)[],
  iDay: number,
  iMonth: number,
  iYear: number
): boolean {
  const dayEmpty = iDay < 0 || isDateCellEmpty(line[iDay]);
  const monthEmpty = iMonth < 0 || isDateCellEmpty(line[iMonth]);
  const yearEmpty = iYear < 0 || isDateCellEmpty(line[iYear]);
  return dayEmpty && monthEmpty && yearEmpty;
}

function truncateDetail(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SHE_DETAIL_MAX_CHARS) return t;
  return t.slice(0, SHE_DETAIL_MAX_CHARS);
}

export function thaiDateToIso(day: unknown, monthTh: unknown, yearBe: unknown): string | null {
  const d = Number(day);
  const monthKey = trimCell(monthTh);
  const month = THAI_MONTHS[monthKey];
  const be = Number(yearBe);
  if (!Number.isFinite(d) || d < 1 || d > 31 || !month || !Number.isFinite(be)) return null;
  const ce = be - 543;
  const iso = `${ce}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== d) return null;
  return iso;
}

function sheetHasData(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true
  });
  return rows.some((r) => r?.some((c) => c != null && String(c).trim() !== ""));
}

function pickDataSheetName(sheetNames: string[]): string | null {
  if (sheetNames.includes(SHE_DATA_SHEET_EXACT)) return SHE_DATA_SHEET_EXACT;
  const trimmed = sheetNames.find((n) => n.trim() === "DATA");
  return trimmed ?? null;
}

function loadDataSheet(buffer: Buffer): XLSX.WorkSheet | null {
  const meta = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  const candidate = pickDataSheetName(meta.SheetNames);
  if (!candidate) return null;

  const readOpts = {
    type: "buffer" as const,
    sheets: [candidate],
    sheetRows: SHE_MAX_DATA_ROWS + 30
  };
  if (candidate === SHE_DATA_SHEET_EXACT) {
    const wb = XLSX.read(buffer, readOpts);
    return wb.Sheets[candidate] ?? null;
  }

  const probe = XLSX.read(buffer, readOpts);
  const sheet = probe.Sheets[candidate];
  if (!sheet || !sheetHasData(sheet)) return null;
  return sheet;
}

function findHeaderRow(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const first = trimCell(rows[i]?.[0]);
    if (first === "NO." || first === "NO") return i;
  }
  return -1;
}

function colIndex(header: string[], ...labels: string[]): number {
  for (const label of labels) {
    const idx = header.findIndex((h) => trimCell(h) === label);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseSheWorkbook(buffer: Buffer): SheParseResult {
  const stats: SheParseStats = {
    skippedInvalidDate: [],
    excludedCount: 0,
    excludedNos: [],
    borderlineNos: [],
    importedCount: 0
  };
  const rows: ParsedSheRow[] = [];
  let fileYear: number | null = null;

  const sheet = loadDataSheet(buffer);
  if (!sheet) {
    return { rows, stats, fileYear };
  }

  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true
  });
  const headerIdx = findHeaderRow(grid);
  if (headerIdx < 0) {
    return { rows, stats, fileYear };
  }

  const header = grid[headerIdx].map((c) => trimCell(c));
  const iNo = colIndex(header, "NO.");
  const iDetail = colIndex(header, "รายละเอียดอุบัติเหตุ");
  const iDay = colIndex(header, "วัน");
  const iMonth = colIndex(header, "เดือน");
  const iYear = colIndex(header, "ปี");
  const iBranch = colIndex(header, "สาขา");
  const iIncidentCat = colIndex(header, "ประเภทการประสบเหตุ");
  const iType2 = colIndex(header, "ประเภท2");
  const iSeverity = colIndex(header, "ระดับความรุนแรง");
  const iDept = colIndex(header, "แผนก");

  let dataRows = 0;
  for (let r = headerIdx + 1; r < grid.length && dataRows < SHE_MAX_DATA_ROWS; r += 1) {
    const line = grid[r];
    if (!line || line.every((c) => c == null || trimCell(c) === "")) continue;
    const noRaw = line[iNo];
    const incidentNo = Number(noRaw);
    if (!Number.isFinite(incidentNo)) continue;
    if (isDateRowBlank(line, iDay, iMonth, iYear)) continue;
    dataRows += 1;

    const detailFull = iDetail >= 0 ? trimCell(line[iDetail]) : "";
    const incidentCategory = iIncidentCat >= 0 ? trimCell(line[iIncidentCat]) : "";
    const rawType2 = iType2 >= 0 ? trimCell(line[iType2]) : "";
    const iso = thaiDateToIso(
      iDay >= 0 ? line[iDay] : null,
      iMonth >= 0 ? line[iMonth] : null,
      iYear >= 0 ? line[iYear] : null
    );
    if (!iso) {
      stats.skippedInvalidDate.push(incidentNo);
      continue;
    }
    const beYear = iYear >= 0 ? Number(line[iYear]) : NaN;
    if (Number.isFinite(beYear)) fileYear = beYear;

    // ประเภท2 not in data/she-mapping.json (e.g. LI, blank) is hidden but reported.
    // PD (incl. machine downtime) is counted, matching SHE's own totals.
    const kpi = normalizeSheKpiCategory(rawType2);
    if (!kpi) {
      stats.excludedCount += 1;
      stats.excludedNos.push(incidentNo);
      continue;
    }

    const plant = normalizeShePlant(iBranch >= 0 ? trimCell(line[iBranch]) : "");
    rows.push({
      incidentNo,
      fileYear: Number.isFinite(beYear) ? beYear : 0,
      occurredDate: iso,
      plant,
      kpiCategory: kpi,
      rawType2: rawType2 || null,
      incidentCategory: incidentCategory || null,
      severity: iSeverity >= 0 ? trimCell(line[iSeverity]) || null : null,
      department: iDept >= 0 ? trimCell(line[iDept]) || null : null,
      detailShort: detailFull ? truncateDetail(detailFull) : null
    });
    stats.importedCount += 1;
  }

  return { rows, stats, fileYear };
}

export function assertXlsxBuffer(buffer: Buffer, fileName: string): void {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx files are accepted");
  }
  if (buffer.length < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("File is not a valid xlsx (zip) archive");
  }
  const maxBytes = 10 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error("File exceeds 10 MB limit");
  }
}
