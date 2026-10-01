import sql from "mssql";

export type RmPlant = "RMD7" | "RMD8" | "MSM";

export const RM_PLANTS: RmPlant[] = ["RMD7", "RMD8", "MSM"];

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

function configFor(plant: RmPlant): sql.config {
  const prefix = "SQL_RM_" + plant + "_";
  return {
    server: process.env[prefix + "HOST"] || "",
    port: Number(process.env[prefix + "PORT"] || 1433),
    database: process.env[prefix + "DATABASE"] || "",
    user: process.env[prefix + "USER"] || "",
    password: process.env[prefix + "PASSWORD"] || "",
    options: {
      encrypt: boolEnv(prefix + "ENCRYPT", false),
      trustServerCertificate: boolEnv(prefix + "TRUST_SERVER_CERT", true)
    },
    connectionTimeout: 8000,
    requestTimeout: 20000
  };
}

export function isRmSourceConfigured(plant: RmPlant) {
  const cfg = configFor(plant);
  return Boolean(cfg.server && cfg.database && cfg.user && cfg.password);
}

const pools = new Map<RmPlant, sql.ConnectionPool>();

export async function getRmSourcePool(plant: RmPlant) {
  if (!isRmSourceConfigured(plant)) {
    throw new Error(`RM source for ${plant} is not configured`);
  }
  const existing = pools.get(plant);
  if (existing?.connected) return existing;
  const pool = await new sql.ConnectionPool(configFor(plant)).connect();
  pools.set(plant, pool);
  return pool;
}

export { sql };
