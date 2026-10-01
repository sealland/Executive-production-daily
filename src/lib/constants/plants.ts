/**
 * Dashboard plant grouping:
 * - OCP
 * - MMT = RMD7 + RMD8 + SMD (and aliases MR7, MR8, MSM)
 */
export const CANONICAL_PLANTS = ["OCP", "MMT"] as const;

/** Raw CEO / Downtime codes folded into MMT. */
export const MMT_SOURCE_PLANTS = ["RMD7", "RMD8", "SMD"] as const;

/** Any known alias → canonical dashboard plant code. */
export const PLANT_ALIASES: Record<string, string> = {
  OCP: "OCP",
  MMT: "MMT",
  RMD7: "MMT",
  MR7: "MMT",
  RMD8: "MMT",
  MR8: "MMT",
  SMD: "MMT",
  MSM: "MMT"
};

/** CPP JSON keys (byPlantMonth) that roll up into each dashboard plant. */
export const CPP_SOURCES_BY_PLANT: Record<string, string[]> = {
  OCP: ["OCP"],
  MMT: ["RMD7", "RMD8", "SMD"]
};

export function normalizePlant(plant: string | undefined | null): string | undefined {
  if (!plant) return undefined;
  const key = plant.trim().toUpperCase();
  return PLANT_ALIASES[key] || key;
}

export function cppSourcePlants(dashboardPlant: string | undefined | null): string[] {
  const canonical = normalizePlant(dashboardPlant);
  if (!canonical) return [];
  return CPP_SOURCES_BY_PLANT[canonical] || [];
}

const PLANT_TOKEN = `
  CASE
    WHEN CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) > 0
      THEN LEFT(LTRIM(RTRIM(prd_plant)), CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) - 1)
    ELSE LTRIM(RTRIM(prd_plant))
  END
`;

/** SQL expression: derive dashboard plant from prd_plant. */
export const PLANT_EXPR = `
CASE
  WHEN UPPER(${PLANT_TOKEN}) = 'OCP' THEN 'OCP'
  WHEN UPPER(${PLANT_TOKEN}) IN ('RMD7', 'MR7', 'RMD8', 'MR8', 'SMD', 'MSM') THEN 'MMT'
  ELSE ${PLANT_TOKEN}
END
`;

/** Downtime Station values that belong to a canonical plant. */
export function downtimeStationsForPlant(plant: string | undefined | null): string[] {
  const canonical = normalizePlant(plant);
  if (!canonical) return [];
  if (canonical === "MMT") return ["RMD7", "RMD8", "SMD", "MSM"];
  return [canonical];
}
