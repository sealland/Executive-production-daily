/**
 * Canonical dashboard plant codes and aliases from other systems.
 * MSM (CPP / Downtime machine) = SMD (CEO_REPORT).
 */
export const CANONICAL_PLANTS = ["OCP", "RMD7", "RMD8", "SMD"] as const;

/** Any known alias → canonical dashboard plant code. */
export const PLANT_ALIASES: Record<string, string> = {
  OCP: "OCP",
  RMD7: "RMD7",
  MR7: "RMD7",
  RMD8: "RMD8",
  MR8: "RMD8",
  SMD: "SMD",
  MSM: "SMD"
};

/** Dashboard plant → CPP Excel row code (sheet สรุป). */
export const DASHBOARD_TO_CPP: Record<string, string> = {
  OCP: "OCP",
  RMD7: "MR7",
  RMD8: "MR8",
  SMD: "MSM"
};

export function normalizePlant(plant: string | undefined | null): string | undefined {
  if (!plant) return undefined;
  const key = plant.trim().toUpperCase();
  return PLANT_ALIASES[key] || key;
}

/** SQL expression: derive plant from prd_plant and fold MSM → SMD. */
export const PLANT_EXPR = `
CASE
  WHEN UPPER(
    CASE
      WHEN CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) > 0
        THEN LEFT(LTRIM(RTRIM(prd_plant)), CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) - 1)
      ELSE LTRIM(RTRIM(prd_plant))
    END
  ) IN ('MSM', 'SMD') THEN 'SMD'
  ELSE
    CASE
      WHEN CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) > 0
        THEN LEFT(LTRIM(RTRIM(prd_plant)), CHARINDEX(' ', LTRIM(RTRIM(prd_plant))) - 1)
      ELSE LTRIM(RTRIM(prd_plant))
    END
END
`;

/** Downtime Station values that belong to a canonical plant. */
export function downtimeStationsForPlant(plant: string | undefined | null): string[] {
  const canonical = normalizePlant(plant);
  if (!canonical) return [];
  if (canonical === "SMD") return ["SMD", "MSM"];
  return [canonical];
}
