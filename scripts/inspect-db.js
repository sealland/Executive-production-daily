require("dotenv").config();
const sql = require("mssql");

function connectConfig() {
  return {
    server: process.env.SQL_SERVER_HOST,
    port: Number(process.env.SQL_SERVER_PORT || 1433),
    database: process.env.SQL_SERVER_DATABASE,
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    options: {
      encrypt: String(process.env.SQL_SERVER_ENCRYPT).toLowerCase() === "true",
      trustServerCertificate:
        String(process.env.SQL_SERVER_TRUST_SERVER_CERT).toLowerCase() !== "false"
    }
  };
}

async function query(pool, text) {
  return pool.request().query(text);
}

async function columnSummary(pool, objectName) {
  const result = await pool
    .request()
    .input("name", sql.NVarChar, objectName)
    .query(`
      SELECT c.column_id, c.name AS column_name, ty.name AS data_type,
             c.precision, c.scale, c.is_nullable
      FROM sys.objects o
      JOIN sys.columns c ON c.object_id = o.object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE o.name = @name
      ORDER BY c.column_id
    `);
  return result.recordset;
}

async function main() {
  const pool = await sql.connect(connectConfig());

  const coverage = await query(
    pool,
    `
    SELECT 'tbl_prd_daily_new' AS source, COUNT_BIG(*) AS row_count,
           CONVERT(varchar(10), MIN(prd_date), 23) AS min_date,
           CONVERT(varchar(10), MAX(prd_date), 23) AS max_date
    FROM dbo.tbl_prd_daily_new
    UNION ALL
    SELECT 'tbl_prd_summary_new', COUNT_BIG(*),
           CONVERT(varchar(10), MIN(prd_date), 23),
           CONVERT(varchar(10), MAX(prd_date), 23)
    FROM dbo.tbl_prd_summary_new
    UNION ALL
    SELECT 'production_planDev', COUNT_BIG(*),
           CONVERT(varchar(10), MIN(postingdate), 23),
           CONVERT(varchar(10), MAX(postingdate), 23)
    FROM dbo.production_planDev
    UNION ALL
    SELECT 'production_actual_snapshot', COUNT_BIG(*),
           CONVERT(varchar(10), MIN(postingdate), 23),
           CONVERT(varchar(10), MAX(postingdate), 23)
    FROM dbo.production_actual_snapshot
    `
  );

  const plants = await query(
    pool,
    `
    SELECT TOP 20 prd_plant, COUNT(*) AS rows_n
    FROM dbo.tbl_prd_daily_new
    GROUP BY prd_plant
    ORDER BY rows_n DESC
    `
  );

  const stations = await query(
    pool,
    `
    SELECT TOP 30 prd_plant, prd_station, COUNT(*) AS rows_n
    FROM dbo.tbl_prd_daily_new
    GROUP BY prd_plant, prd_station
    ORDER BY rows_n DESC
    `
  );

  const dailySample = await query(
    pool,
    `
    SELECT TOP 5
      prd_date, prd_plant, prd_station, prd_size, matcode, goal,
      A_weight, A_qty, A2_weight, Y1_weight, Y2_weight, Y3_weight, Y4_weight
    FROM dbo.tbl_prd_daily_new
    ORDER BY prd_date DESC
    `
  );

  const summarySample = await query(
    pool,
    `
    SELECT TOP 5
      prd_date, prd_plant, prd_station, prd_type, prd_size,
      material_code, prd_goal, prd_a, prd_b, prd_r, internal_name
    FROM dbo.tbl_prd_summary_new
    ORDER BY prd_date DESC
    `
  );

  const yieldCols = await columnSummary(pool, "vw_prd_yield");
  const plantCols = await columnSummary(pool, "tbl_plant");
  const stationCols = await columnSummary(pool, "tbl_station");
  const matGroupCols = await columnSummary(pool, "tbl_matgroup");
  const productCols = await columnSummary(pool, "Producttbl");

  const missingObjects = await query(
    pool,
    `
    SELECT name, type_desc
    FROM sys.objects
    WHERE type IN ('U', 'V')
      AND (
        LOWER(name) LIKE '%down%'
        OR LOWER(name) LIKE '%oee%'
        OR LOWER(name) LIKE '%scrap%'
        OR LOWER(name) LIKE '%reject%'
        OR LOWER(name) LIKE '%calendar%'
        OR LOWER(name) LIKE '%holiday%'
        OR LOWER(name) LIKE '%loss%'
        OR LOWER(name) LIKE '%target%'
      )
    ORDER BY name
    `
  );

  const report = {
    database: process.env.SQL_SERVER_DATABASE,
    coverage: coverage.recordset,
    plants: plants.recordset,
    topStations: stations.recordset,
    dailySample: dailySample.recordset,
    summarySample: summarySample.recordset,
    columns: {
      vw_prd_yield: yieldCols,
      tbl_plant: plantCols,
      tbl_station: stationCols,
      tbl_matgroup: matGroupCols,
      Producttbl: productCols
    },
    relatedObjects: missingObjects.recordset
  };

  console.log(JSON.stringify(report, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error("INSPECT_FAILED:", error.message);
  process.exit(1);
});
