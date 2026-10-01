import sql from "mssql";

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

const config: sql.config = {
  server: process.env.SQL_SERVER_HOST || "",
  port: Number(process.env.SQL_SERVER_PORT || 1433),
  database: process.env.SQL_SERVER_DATABASE || "",
  user: process.env.SQL_SERVER_USER || "",
  password: process.env.SQL_SERVER_PASSWORD || "",
  options: {
    encrypt: boolEnv("SQL_SERVER_ENCRYPT", false),
    trustServerCertificate: boolEnv("SQL_SERVER_TRUST_SERVER_CERT", true)
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

export function isCeoConfigured() {
  return Boolean(config.server && config.database && config.user && config.password);
}

export async function getCeoPool() {
  if (!isCeoConfigured()) {
    throw new Error("CEO_REPORT connection is not configured");
  }
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export { sql };
