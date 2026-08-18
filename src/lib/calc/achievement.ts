import type { AchievementStatus } from "@/lib/types/production";

export function calcAchievementPct(actual: number, target: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return null;
  return (actual / target) * 100;
}

export function achievementStatus(pct: number | null): AchievementStatus {
  if (pct === null || !Number.isFinite(pct)) return "neutral";
  if (pct >= 100) return "green";
  if (pct >= 95) return "yellow";
  return "red";
}

export function calcYieldPct(good: number, gradeB: number, reject: number): number | null {
  const total = good + gradeB + reject;
  if (!Number.isFinite(total) || total <= 0) return null;
  return (good / total) * 100;
}

export function calcYoyPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
