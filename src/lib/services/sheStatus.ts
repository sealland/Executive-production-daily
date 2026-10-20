import { normalizeShePlant } from "@/lib/services/sheMapping";

export const SHE_CARD_PLANTS = ["RMD7", "RMD8", "MSM"] as const;
export type SheCardPlant = (typeof SHE_CARD_PLANTS)[number];

const INJURY_CATEGORIES = new Set(["LTI", "TRI", "First Aid"]);
const LTI_TRI = new Set(["LTI", "TRI"]);

export type ShePlantDotStatus = "green" | "yellow" | "red" | "gray";

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Calendar days from dateIso through asOfIso (same day = 0). Future dates yield negative values. */
export function daysSince(dateIso: string, asOfIso: string): number {
  const start = parseUtcDate(dateIso).getTime();
  const end = parseUtcDate(asOfIso).getTime();
  return Math.floor((end - start) / 86_400_000);
}

export function isSheCardPlant(plant: string): boolean {
  return (SHE_CARD_PLANTS as readonly string[]).includes(plant);
}

/** MR7→RMD7, MR8→RMD8, MSM→MSM; unknown branch → Other (not a display card). */
export function mapBranchToShePlant(branch: string | null | undefined): string {
  return normalizeShePlant(branch);
}

export function plantStatus(
  hasData: boolean,
  lastLtiTriDate: string | null,
  lastLtiTriCategory: string | null,
  lastInjuryDate: string | null,
  lastInjuryCategory: string | null,
  asOfIso: string
): ShePlantDotStatus {
  if (!hasData) return "gray";
  if (lastLtiTriDate && lastLtiTriCategory && LTI_TRI.has(lastLtiTriCategory)) {
    if (daysSince(lastLtiTriDate, asOfIso) <= 30) return "red";
  }
  if (lastInjuryDate && lastInjuryCategory && INJURY_CATEGORIES.has(lastInjuryCategory)) {
    if (daysSince(lastInjuryDate, asOfIso) <= 30) return "yellow";
  }
  return "green";
}

export function plantDotAriaLabel(status: ShePlantDotStatus): string {
  if (status === "gray") return "ไม่มีข้อมูล";
  if (status === "red") return "สถานะ: มี LTI หรือ TRI ภายใน 30 วัน";
  if (status === "yellow") return "สถานะ: มีเหตุบาดเจ็บ (First Aid) ภายใน 30 วัน";
  return "สถานะ: ไม่มีเหตุบาดเจ็บภายใน 30 วัน";
}
