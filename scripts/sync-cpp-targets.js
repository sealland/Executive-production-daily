/**
 * Refresh data/cpp-targets-2026.json from CPP/Zubb CPP Jan-Dec26.xlsm (sheet สรุป).
 * Run: npm run cpp:sync
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const MAP = { MR7: "RMD7", MR8: "RMD8", MSM: "SMD", OCP: "OCP" }; // MSM = SMD
const excelPath = process.env.CPP_TARGET_FILE || path.join("CPP", "Zubb CPP Jan-Dec26.xlsm");
const outPath = process.env.CPP_TARGET_JSON || path.join("data", "cpp-targets-2026.json");

if (!fs.existsSync(excelPath)) {
  console.error("Excel not found:", excelPath);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath, { cellDates: false });
const sheet = wb.Sheets["สรุป"];
if (!sheet) {
  console.error('Sheet "สรุป" not found');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
let headerIndex = rows.findIndex(
  (r) => typeof r?.[0] === "string" && String(r[0]).includes("Actual CPP")
);
if (headerIndex < 0) {
  headerIndex = rows.findIndex(
    (r) => typeof r?.[0] === "string" && String(r[0]).startsWith("CPP ")
  );
}
if (headerIndex < 0) {
  console.error("CPP header row not found");
  process.exit(1);
}

const header = rows[headerIndex];
const monthColumns = [];
let year = 2026;
for (let col = 2; col < header.length; col += 1) {
  if (typeof header[col] === "number") {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(header[col]) * 86400000);
    monthColumns.push({ col, month: utc.getUTCMonth() + 1, year: utc.getUTCFullYear() });
    year = utc.getUTCFullYear();
  }
}

const byPlantMonth = {};
const byPlantYear = {};
for (let r = headerIndex + 1; r < rows.length; r += 1) {
  const row = rows[r];
  if (
    typeof row?.[0] === "string" &&
    (String(row[0]).startsWith("CPP ") || String(row[0]).includes("Actual CPP"))
  ) {
    break;
  }
  const code = row?.[1];
  if (typeof code !== "string" || !MAP[code.trim()]) continue;
  const plant = MAP[code.trim()];
  const months = {};
  for (const m of monthColumns) months[m.month] = Number(row[m.col] || 0);
  byPlantMonth[plant] = months;
  const total = row[header.length - 1];
  byPlantYear[plant] =
    typeof total === "number" ? total : Object.values(months).reduce((a, b) => a + b, 0);
}

const out = {
  source: excelPath,
  planLabel: String(header[0]),
  year,
  byPlantMonth,
  byPlantYear,
  exportedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("Wrote", outPath);
console.log(JSON.stringify({ planLabel: out.planLabel, year: out.year, byPlantYear: out.byPlantYear }, null, 2));
