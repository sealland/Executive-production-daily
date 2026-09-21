import fs from "fs";
import path from "path";
import { cppSourcePlants } from "@/lib/constants/plants";

/**
 * CPP Excel row codes → JSON storage keys (sheet สรุป).
 * Trend-N is trade volume, not factory production — excluded from production targets.
 */
export const CPP_PLANT_TO_DASHBOARD: Record<string, string> = {
  OCP: "OCP",
  MR7: "RMD7",
  MR8: "RMD8",
  MSM: "SMD"
};

export interface CppTargetBook {
  source: string;
  planLabel: string;
  year: number;
  /** plant → month(1-12) → ton */
  byPlantMonth: Record<string, Record<number, number>>;
  /** plant → annual total from the Total column */
  byPlantYear: Record<string, number>;
  exportedAt?: string;
}

const JSON_RELATIVE = path.join("data", "cpp-targets-2026.json");
const EXCEL_RELATIVE = path.join("CPP", "Zubb CPP Jan-Dec26.xlsm");
const PRODUCTION_PLANTS = new Set(Object.keys(CPP_PLANT_TO_DASHBOARD));

let cache: CppTargetBook | null = null;
let cacheKey = "";

function resolveExisting(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function excelSerialToYearMonth(serial: number): { year: number; month: number } | null {
  if (!Number.isFinite(serial)) return null;
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1 };
}

function parseSummaryRows(rows: unknown[][], source: string): CppTargetBook | null {
  let headerIndex = rows.findIndex(
    (row) => typeof row?.[0] === "string" && String(row[0]).includes("Actual CPP")
  );
  if (headerIndex < 0) {
    headerIndex = rows.findIndex(
      (row) => typeof row?.[0] === "string" && String(row[0]).startsWith("CPP ")
    );
  }
  if (headerIndex < 0) return null;

  const header = rows[headerIndex] as unknown[];
  const planLabel = String(header[0] || "CPP");
  const monthColumns: { col: number; year: number; month: number }[] = [];
  let year = 2026;

  for (let col = 2; col < header.length; col += 1) {
    const cell = header[col];
    if (typeof cell === "number") {
      const ym = excelSerialToYearMonth(cell);
      if (ym) {
        monthColumns.push({ col, year: ym.year, month: ym.month });
        year = ym.year;
      }
    }
  }

  const byPlantMonth: Record<string, Record<number, number>> = {};
  const byPlantYear: Record<string, number> = {};

  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const label = row[0];
    if (typeof label === "string" && (label.startsWith("CPP ") || label.includes("Actual CPP"))) {
      break;
    }

    const plantCode = row[1];
    if (typeof plantCode !== "string" || !PRODUCTION_PLANTS.has(plantCode.trim())) {
      continue;
    }

    const dashboardPlant = CPP_PLANT_TO_DASHBOARD[plantCode.trim()];
    const months: Record<number, number> = {};
    for (const { col, month } of monthColumns) {
      const value = Number(row[col] || 0);
      months[month] = Number.isFinite(value) ? value : 0;
    }
    byPlantMonth[dashboardPlant] = months;

    const totalCell = row[header.length - 1];
    const total =
      typeof totalCell === "number" && Number.isFinite(totalCell)
        ? totalCell
        : Object.values(months).reduce((sum, n) => sum + n, 0);
    byPlantYear[dashboardPlant] = total;
  }

  if (!Object.keys(byPlantMonth).length) return null;

  return {
    source,
    planLabel,
    year,
    byPlantMonth,
    byPlantYear
  };
}

function loadFromJson(filePath: string): CppTargetBook | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as CppTargetBook;
    if (!raw?.byPlantMonth || !raw?.byPlantYear || !raw.year) return null;
    // JSON keys for months are strings — normalize to numbers.
    const byPlantMonth: Record<string, Record<number, number>> = {};
    for (const [plant, months] of Object.entries(raw.byPlantMonth)) {
      byPlantMonth[plant] = {};
      for (const [month, value] of Object.entries(months)) {
        byPlantMonth[plant][Number(month)] = Number(value || 0);
      }
    }
    return {
      ...raw,
      source: raw.source || filePath,
      byPlantMonth
    };
  } catch {
    return null;
  }
}

function loadFromExcel(filePath: string): CppTargetBook | null {
  try {
    // Lazy require so client bundles never pull xlsx/fs Excel parsing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const sheet = wb.Sheets["สรุป"];
    if (!sheet) return null;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true
    }) as unknown[][];
    return parseSummaryRows(rows, filePath);
  } catch {
    return null;
  }
}

export function loadCppTargets(): CppTargetBook | null {
  const jsonPath = resolveExisting(
    process.env.CPP_TARGET_JSON,
    path.resolve(process.cwd(), JSON_RELATIVE)
  );
  const excelPath = resolveExisting(
    process.env.CPP_TARGET_FILE,
    path.resolve(process.cwd(), EXCEL_RELATIVE)
  );

  const key = `${jsonPath || ""}|${excelPath || ""}|${
    jsonPath && fs.existsSync(jsonPath) ? fs.statSync(jsonPath).mtimeMs : 0
  }|${excelPath && fs.existsSync(excelPath) ? fs.statSync(excelPath).mtimeMs : 0}`;

  if (cache && cacheKey === key) return cache;

  // JSON snapshot is the reliable runtime source (xlsm may be locked by Excel).
  // Excel is tried first only when JSON is missing.
  const fromJson = jsonPath ? loadFromJson(jsonPath) : null;
  const fromExcel = !fromJson && excelPath ? loadFromExcel(excelPath) : null;
  const book = fromJson || fromExcel;
  cache = book;
  cacheKey = key;
  return book;
}

function selectedPlants(plantFilter?: string): string[] | null {
  if (!plantFilter) return null;
  const sources = cppSourcePlants(plantFilter);
  if (!sources.length) return [];
  return sources;
}

/**
 * CPP monthly target for a calendar month.
 * Returns null when the CPP book has no coverage for that year/plant set
 * (caller should fall back to prd_goal).
 */
export function getCppMonthlyTarget(
  year: number,
  month: number,
  plantFilter?: string
): number | null {
  const book = loadCppTargets();
  if (!book || book.year !== year) return null;

  const plants = selectedPlants(plantFilter);
  if (plants && plants.length === 0) return null;

  const list = plants || Object.keys(book.byPlantMonth);
  let sum = 0;
  let hit = false;
  for (const plant of list) {
    const value = book.byPlantMonth[plant]?.[month];
    if (value !== undefined) {
      sum += value;
      hit = true;
    }
  }
  return hit ? sum : null;
}

/** Sum of monthly CPP targets from monthFrom..monthTo inclusive. */
export function getCppPeriodTarget(
  year: number,
  monthFrom: number,
  monthTo: number,
  plantFilter?: string
): number | null {
  const book = loadCppTargets();
  if (!book || book.year !== year) return null;

  const plants = selectedPlants(plantFilter);
  if (plants && plants.length === 0) return null;

  const list = plants || Object.keys(book.byPlantMonth);
  let sum = 0;
  let hit = false;
  for (const plant of list) {
    const months = book.byPlantMonth[plant];
    if (!months) continue;
    for (let m = monthFrom; m <= monthTo; m += 1) {
      if (months[m] !== undefined) {
        sum += months[m];
        hit = true;
      }
    }
  }
  return hit ? sum : null;
}

export function getCppYearlyTarget(year: number, plantFilter?: string): number | null {
  const book = loadCppTargets();
  if (!book || book.year !== year) return null;

  const plants = selectedPlants(plantFilter);
  if (plants && plants.length === 0) return null;

  const list = plants || Object.keys(book.byPlantYear);
  let sum = 0;
  let hit = false;
  for (const plant of list) {
    if (book.byPlantYear[plant] !== undefined) {
      sum += book.byPlantYear[plant];
      hit = true;
    }
  }
  return hit ? sum : null;
}

export function getCppPlantPeriodTarget(
  year: number,
  monthFrom: number,
  monthTo: number,
  plant: string
): number | null {
  return getCppPeriodTarget(year, monthFrom, monthTo, plant);
}
