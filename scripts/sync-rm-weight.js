/**
 * Pull RM weight (billet charge for RMD7/RMD8, scrap charge for MSM) from each
 * plant's own SQL Server and stage it into CEO_REPORT.dbo.tbl_prd_rm_weight,
 * so the report can compute a real Yield (RMD7/RMD8: FG / billet weight per charge,
 * MSM: Actual / RM). Keep the RMD query in sync with src/lib/services/rmWeight.ts.
 *
 * Run: npm run rm:sync -- 2026-09-15
 * (defaults to yesterday, UTC, if no date is given)
 */
require("dotenv").config();
const sql = require("mssql");

function boolEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true";
}

function ceoConfig() {
  return {
    server: process.env.SQL_SERVER_HOST,
    port: Number(process.env.SQL_SERVER_PORT || 1433),
    database: process.env.SQL_SERVER_DATABASE,
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    options: {
      encrypt: boolEnv("SQL_SERVER_ENCRYPT", false),
      trustServerCertificate: boolEnv("SQL_SERVER_TRUST_SERVER_CERT", true)
    }
  };
}

function rmConfig(plant) {
  const prefix = "SQL_RM_" + plant + "_";
  return {
    server: process.env[prefix + "HOST"],
    port: Number(process.env[prefix + "PORT"] || 1433),
    database: process.env[prefix + "DATABASE"],
    user: process.env[prefix + "USER"],
    password: process.env[prefix + "PASSWORD"],
    options: {
      encrypt: boolEnv(prefix + "ENCRYPT", false),
      trustServerCertificate: boolEnv(prefix + "TRUST_SERVER_CERT", true)
    },
    connectionTimeout: 8000,
    requestTimeout: 20000
  };
}

// FG bundle tag table, same name in both RMD7 and RMD8 DBs.
const RMD_FG_TAG_TABLE = "dbo.tbl_rmd_weight_line";

async function fetchRollingMillKg(plant, date) {
  const pool = await new sql.ConnectionPool(rmConfig(plant)).connect();
  try {
    const result = await pool.request().input("d", sql.Date, date).query(`
      WITH tags AS (
        SELECT rmd_charge, COUNT(*) AS actual_bundle, SUM(ISNULL(rmd_weight, 0)) AS fg_kg
        FROM ${RMD_FG_TAG_TABLE}
        WHERE rmd_date >= @d AND rmd_date < DATEADD(day, 1, @d)
          AND ISNULL(rmd_tis_check, '') <> 'X'
        GROUP BY rmd_charge
      ),
      charges AS (
        SELECT
          t.fg_kg,
          ISNULL(s.rmd_weightbillet, 0) AS billet_kg,
          ISNULL(s.rmd_defect, 0) AS defect,
          CASE
            WHEN ISNULL(s.rmd_bundle, 0) <= 0 OR t.actual_bundle >= s.rmd_bundle THEN ISNULL(s.rmd_qty, 0)
            ELSE ROUND(s.rmd_qty * t.actual_bundle / CAST(s.rmd_bundle AS float), 0)
          END AS billets_used
        FROM dbo.tbl_rmd_weight_schedule s
        JOIN tags t ON t.rmd_charge = s.rmd_charge
        WHERE s.rmd_date >= @d AND s.rmd_date < DATEADD(day, 1, @d)
      )
      SELECT
        SUM(fg_kg) AS fgKg,
        SUM(CASE WHEN billets_used > defect THEN (billets_used - defect) * billet_kg ELSE 0 END) AS blKg
      FROM charges
    `);
    const row = result.recordset[0] || {};
    return { rmKg: Number(row.blKg || 0), fgKg: Number(row.fgKg || 0) };
  } finally {
    await pool.close();
  }
}

async function fetchMeltShopRmKg(date) {
  const pool = await new sql.ConnectionPool(rmConfig("MSM")).connect();
  try {
    const result = await pool.request().input("d", sql.Date, date).query(`
      SELECT SUM(ISNULL(we_weight_net, 0)) AS totalKg
      FROM dbo.tbl_weight
      WHERE CONVERT(date, we_date) = @d
    `);
    return { rmKg: Number(result.recordset[0]?.totalKg || 0), fgKg: null };
  } finally {
    await pool.close();
  }
}

async function main() {
  const date = process.argv[2] || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  console.log("Syncing RM weight for", date);

  const plants = [
    { plant: "RMD7", fetchKg: () => fetchRollingMillKg("RMD7", date), note: "tbl_rmd_weight_schedule x FG tags (per-charge yield)" },
    { plant: "RMD8", fetchKg: () => fetchRollingMillKg("RMD8", date), note: "tbl_rmd_weight_schedule x FG tags (per-charge yield)" },
    { plant: "MSM", fetchKg: () => fetchMeltShopRmKg(date), note: "tbl_weight (melt shop weighbridge)" }
  ];

  const ceoPool = await new sql.ConnectionPool(ceoConfig()).connect();
  try {
    for (const { plant, fetchKg, note } of plants) {
      try {
        const { rmKg, fgKg } = await fetchKg();
        const ton = rmKg / 1000;
        const fgTon = fgKg == null ? null : fgKg / 1000;
        await ceoPool
          .request()
          .input("d", sql.Date, date)
          .input("plant", sql.NVarChar, plant)
          .input("ton", sql.Float, ton)
          .input("fg", sql.Float, fgTon)
          .input("note", sql.NVarChar, note)
          .query(`
            MERGE dbo.tbl_prd_rm_weight AS target
            USING (SELECT @d AS report_date, @plant AS plant) AS src
              ON target.report_date = src.report_date AND target.plant = src.plant
            WHEN MATCHED THEN
              UPDATE SET rm_weight_ton = @ton, fg_weight_ton = @fg, source_note = @note, synced_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
              INSERT (report_date, plant, rm_weight_ton, fg_weight_ton, source_note, synced_at)
              VALUES (@d, @plant, @ton, @fg, @note, SYSUTCDATETIME());
          `);
        const yieldText = fgTon != null && ton > 0 ? "  yield " + ((fgTon / ton) * 100).toFixed(1) + "%" : "";
        console.log(plant + ": " + ton.toFixed(1) + " ton RM" + yieldText + "  (source: " + note + ")");
      } catch (e) {
        console.error(plant + ": FAILED - " + e.message);
      }
    }
  } finally {
    await ceoPool.close();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
