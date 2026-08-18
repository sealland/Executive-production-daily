import type { AchievementStatus } from "@/lib/types/production";

export function formatTon(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} T`;
}

export function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;
}

export function formatSignedPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPct(value, digits)}`;
}

export function formatMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("en-US")} min`;
}

export function statusLabel(status: AchievementStatus) {
  switch (status) {
    case "green":
      return "ตามเป้า";
    case "yellow":
      return "ใกล้เป้า";
    case "red":
      return "ต่ำกว่าเป้า";
    default:
      return "ไม่มีเป้า";
  }
}

export function statusClass(status: AchievementStatus) {
  switch (status) {
    case "green":
      return "status-green";
    case "yellow":
      return "status-yellow";
    case "red":
      return "status-red";
    default:
      return "status-neutral";
  }
}
