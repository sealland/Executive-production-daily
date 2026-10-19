import mapping from "../../../data/she-mapping.json";

export type SheKpiCategory = "TRI" | "LTI" | "First Aid" | "Near Miss" | "PD";

export const SHE_PLANT_BY_BRANCH: Record<string, string> = mapping.plantByBranch;
export const SHE_PLANT_DEFAULT = mapping.plantDefault as string;
export const SHE_TYPE2_TO_KPI: Record<string, SheKpiCategory> = mapping.type2ToKpi as Record<
  string,
  SheKpiCategory
>;

export function normalizeShePlant(branch: string | null | undefined): string {
  const key = String(branch ?? "").trim();
  if (!key) return SHE_PLANT_DEFAULT;
  return SHE_PLANT_BY_BRANCH[key] ?? SHE_PLANT_DEFAULT;
}

export function normalizeSheKpiCategory(type2: string | null | undefined): SheKpiCategory | null {
  const key = String(type2 ?? "").trim();
  if (!key) return null;
  return SHE_TYPE2_TO_KPI[key] ?? null;
}
