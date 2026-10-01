/**
 * Copies downtime events from the plant-side "center" (RMD7Downtime / RMD8Downtime /
 * SMDDowntime on SQL_DOWNTIME_SRC_HOST) into the central Downtime.dbo.Downtimes table
 * that the report already reads from.
 *
 * Incremental: for each plant, only pulls rows newer than the latest StartTime already
 * present in the central table for that plant's Machine code (MR7/MR8/MSM). First run
 * backfills the whole gap; later runs only pick up new rows - safe to run hourly.
 *
 * Run: npm run downtime:sync
 */
require("dotenv").config();
const sql = require("mssql");

function boolEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true";
}

function centralConfig() {
  return {
    server: process.env.SQL_DOWNTIME_HOST,
    port: Number(process.env.SQL_DOWNTIME_PORT || 1433),
    database: process.env.SQL_DOWNTIME_DATABASE,
    user: process.env.SQL_DOWNTIME_USER,
    password: process.env.SQL_DOWNTIME_PASSWORD,
    options: {
      encrypt: boolEnv("SQL_DOWNTIME_ENCRYPT", false),
      trustServerCertificate: boolEnv("SQL_DOWNTIME_TRUST_SERVER_CERT", true)
    },
    requestTimeout: 60000
  };
}

function sourceConfig(database) {
  return {
    server: process.env.SQL_DOWNTIME_SRC_HOST,
    port: Number(process.env.SQL_DOWNTIME_SRC_PORT || 1433),
    database,
    user: process.env.SQL_DOWNTIME_SRC_USER,
    password: process.env.SQL_DOWNTIME_SRC_PASSWORD,
    options: {
      encrypt: boolEnv("SQL_DOWNTIME_SRC_ENCRYPT", false),
      trustServerCertificate: boolEnv("SQL_DOWNTIME_SRC_TRUST_SERVER_CERT", true)
    },
    connectionTimeout: 8000,
    requestTimeout: 60000
  };
}

const PLANTS = [
  { plant: "RMD7", database: "RMD7Downtime", machine: "MR7", idCol: "ID" },
  { plant: "RMD8", database: "RMD8Downtime", machine: "MR8", idCol: "ID" },
  { plant: "SMD", database: "SMDDowntime", machine: "MSM", idCol: "Id" }
];

async function syncPlant(centralPool, { plant, database, machine, idCol }) {
  // Where to resume from: the newest StartTime already copied for this plant.
  const lastReq = centralPool.request();
  lastReq.input("m", sql.NVarChar, machine);
  const lastResult = await lastReq.query(`SELECT MAX(StartTime) AS maxD FROM dbo.Downtimes WHERE Machine = @m`);
  const since = lastResult.recordset[0]?.maxD || null;

  const sourcePool = await new sql.ConnectionPool(sourceConfig(database)).connect();
  try {
    const req = sourcePool.request();
    let where = "";
    if (since) {
      req.input("since", sql.DateTime2, since);
      where = "WHERE StartTime > @since";
    }
    const selectCols =
      idCol +
      " AS ID, StartTime, EndTime, Minute, [Group], Station, NoOfBillet, [Return], Cobble, HeatNo, Grade, Problem, Cause, [Resolve], Area, Code";
    const result = await req.query(`
      SELECT ${selectCols}
      FROM dbo.Downtimes
      ${where}
      ORDER BY StartTime
    `);
    const rows = result.recordset;
    if (!rows.length) {
      console.log(plant + ": up to date (since " + (since ? since.toISOString() : "the beginning") + "), 0 new rows");
      return;
    }

    const table = new sql.Table("Downtimes");
    table.create = false;
    table.columns.add("Machine", sql.NVarChar(4), { nullable: false });
    table.columns.add("ID", sql.Int, { nullable: false });
    table.columns.add("StartTime", sql.DateTime2, { nullable: false });
    table.columns.add("EndTime", sql.DateTime2, { nullable: false });
    table.columns.add("Minute", sql.Int, { nullable: false });
    table.columns.add("Group", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Station", sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add("NoOfBillet", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Return", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Cobble", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("HeatNo", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Grade", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Problem", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Cause", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Resolve", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Area", sql.NVarChar(sql.MAX), { nullable: true });
    table.columns.add("Code", sql.NVarChar(sql.MAX), { nullable: true });

    for (const row of rows) {
      table.rows.add(
        machine,
        row.ID,
        row.StartTime,
        row.EndTime,
        row.Minute,
        row.Group,
        row.Station,
        row.NoOfBillet,
        row.Return,
        row.Cobble,
        row.HeatNo,
        row.Grade,
        row.Problem,
        row.Cause,
        row.Resolve,
        row.Area,
        row.Code
      );
    }

    await centralPool.request().bulk(table);
    console.log(plant + ": copied " + rows.length + " new rows (since " + (since ? since.toISOString() : "the beginning") + ")");
  } finally {
    await sourcePool.close();
  }
}

async function main() {
  const centralPool = await new sql.ConnectionPool(centralConfig()).connect();
  try {
    for (const cfg of PLANTS) {
      try {
        await syncPlant(centralPool, cfg);
      } catch (e) {
        console.error(cfg.plant + ": FAILED - " + e.message);
      }
    }
  } finally {
    await centralPool.close();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
