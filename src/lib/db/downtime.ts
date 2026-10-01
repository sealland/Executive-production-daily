import sql from "mssql";

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

const config: sql.config = {
  server: process.env.SQL_DOWNTIME_HOST || "",
  port: Number(process.env.SQL_DOWNTIME_PORT || 1433),
  database: process.env.SQL_DOWNTIME_DATABASE || "",
  user: process.env.SQL_DOWNTIME_USER || "",
  password: process.env.SQL_DOWNTIME_PASSWORD || "",
  options: {
    encrypt: boolEnv("SQL_DOWNTIME_ENCRYPT", false),
    trustServerCertificate: boolEnv("SQL_DOWNTIME_TRUST_SERVER_CERT", true)
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

export function isDowntimeConfigured() {
  return Boolean(config.server && config.database && config.user && config.password);
}

export function getDowntimeTable() {
  const schema = process.env.SQL_DOWNTIME_SCHEMA || "dbo";
  const table = process.env.SQL_DOWNTIME_TABLE || "Downtimes";
  return `[${schema}].[${table}]`;
}

export async function getDowntimePool() {
  if (!isDowntimeConfigured()) {
    throw new Error("Downtime connection is not configured");
  }
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export { sql };
