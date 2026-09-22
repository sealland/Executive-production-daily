import sql from "mssql";

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

const config: sql.config = {
  server: process.env.SQL_ACCESS_LOG_HOST || "",
  port: Number(process.env.SQL_ACCESS_LOG_PORT || 1433),
  database: process.env.SQL_ACCESS_LOG_DATABASE || "",
  user: process.env.SQL_ACCESS_LOG_USER || "",
  password: process.env.SQL_ACCESS_LOG_PASSWORD || "",
  options: {
    encrypt: boolEnv("SQL_ACCESS_LOG_ENCRYPT", false),
    trustServerCertificate: boolEnv("SQL_ACCESS_LOG_TRUST_SERVER_CERT", true)
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

export function isAccessLogConfigured() {
  return Boolean(config.server && config.database && config.user && config.password);
}

export function getAccessLogTable() {
  const schema = process.env.SQL_ACCESS_LOG_SCHEMA || "dbo";
  const table = process.env.SQL_ACCESS_LOG_TABLE || "tbl_access_log";
  return `[${schema}].[${table}]`;
}

export async function getAccessLogPool() {
  if (!isAccessLogConfigured()) {
    throw new Error("Access log connection is not configured");
  }
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export { sql };
