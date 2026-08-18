/**
 * CEO_REPORT stores a production line as a Thai name (prd_station, e.g. "ท่อดำ#1")
 * while the Downtime database stores a machine code (Machine, e.g. "I1").
 * Nothing links the two, so the dashboard has to translate before filtering.
 */

import { normalizePlant } from "@/lib/constants/plants";

/** Plants where downtime is logged against a single machine covering the whole plant. */
const PLANT_LEVEL_MACHINES: Record<string, string[]> = {
  RMD7: ["MR7"],
  RMD8: ["MR8"],
  SMD: ["MSM"]
};

/** OCP line names carry the machine number: "ท่อดำ#1" → I1, "ตัวซี#5" → C5. */
const OCP_NAME_PREFIXES: { match: RegExp; machinePrefix: string }[] = [
  { match: /ท่อดำ/, machinePrefix: "I" },
  { match: /ตัวซี/, machinePrefix: "C" }
];

/** Escape hatch for lines that follow neither rule. Key is "PLANT|LINE". */
const EXPLICIT_MACHINES: Record<string, string[]> = {};

export function isPlantLevelDowntime(plant: string | undefined | null): boolean {
  const canonical = normalizePlant(plant);
  if (!canonical) return false;
  return Boolean(PLANT_LEVEL_MACHINES[canonical]);
}

/**
 * Translate a production line into the downtime machine codes it maps to.
 * Returns an empty array when no mapping exists, which callers should treat as
 * "cannot narrow by machine" rather than "no downtime".
 */
export function resolveDowntimeMachines(
  plant: string | undefined | null,
  line: string | undefined | null
): string[] {
  const lineName = line?.trim();
  if (!lineName) return [];

  const plantName = normalizePlant(plant);

  if (plantName) {
    const explicit = EXPLICIT_MACHINES[`${plantName}|${lineName}`];
    if (explicit) return explicit;
  }

  for (const rule of OCP_NAME_PREFIXES) {
    if (rule.match.test(lineName)) {
      const number = lineName.match(/(\d+)/)?.[1];
      if (number) return [`${rule.machinePrefix}${number}`];
    }
  }

  if (plantName && PLANT_LEVEL_MACHINES[plantName]) {
    return PLANT_LEVEL_MACHINES[plantName];
  }

  return [];
}

/** Explains to the user how far the downtime numbers can actually be narrowed. */
export function downtimeScopeNote(
  plant: string | undefined | null,
  line: string | undefined | null
): string | null {
  const lineName = line?.trim();
  if (!lineName) return null;

  if (isPlantLevelDowntime(plant)) {
    return `Downtime ของ ${plant} บันทึกรวมทั้งโรงงาน ไม่ได้แยกตามไลน์ ตัวเลขจึงเป็นของทั้ง ${plant}`;
  }

  if (!resolveDowntimeMachines(plant, lineName).length) {
    return `ยังไม่มีการจับคู่ไลน์ "${lineName}" กับเครื่องในระบบ Downtime ตัวเลขจึงยังไม่ได้กรองตามไลน์`;
  }

  return null;
}
