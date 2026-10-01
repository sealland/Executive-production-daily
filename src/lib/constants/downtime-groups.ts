export const DOWNTIME_CATEGORY_ORDER = [
  "เครื่องกล",
  "ไฟฟ้า",
  "กระบวนการ",
  "Changeover",
  "งานแผน",
  "คุณภาพ",
  "Utility",
  "อื่น ๆ"
] as const;

const CODE_MAP: Record<string, string> = {
  MM: "เครื่องกล",
  M: "เครื่องกล",
  EE: "ไฟฟ้า",
  EM: "ไฟฟ้า",
  E: "ไฟฟ้า",
  PD: "กระบวนการ",
  P: "กระบวนการ",
  PP: "กระบวนการ",
  SETUP: "Changeover",
  "SET UP": "Changeover",
  "CHANGE SIZE": "Changeover",
  "PM-เลื่อนร่อง": "Changeover",
  PM: "งานแผน",
  QA: "คุณภาพ",
  UTD: "Utility",
  IT: "อื่น ๆ",
  OTHER: "อื่น ๆ",
  TEST: "อื่น ๆ"
};

export function mapDowntimeCategory(group: string | null | undefined): string {
  if (!group) return "อื่น ๆ";
  const normalized = group.trim().replace(/\s+/g, " ").toUpperCase();
  if (CODE_MAP[normalized]) return CODE_MAP[normalized];
  if (CODE_MAP[group.trim()]) return CODE_MAP[group.trim()];
  // preserve Thai / mixed labels already present
  if (group.includes("เลื่อนร่อง")) return "Changeover";
  return "อื่น ๆ";
}
