"use client";

import type { ForecastMetrics } from "@/lib/types/production";
import { formatPct, formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

export function ProductionForecast({ data }: { data: ForecastMetrics | null }) {
  if (!data) return <EmptyState />;

  return (
    <div className="forecast-grid">
      <div>
        <span>MTD Actual</span>
        <strong>{formatTon(data.mtdActualTon)}</strong>
      </div>
      <div>
        <span>Monthly Target</span>
        <strong>{formatTon(data.monthlyTargetTon)}</strong>
      </div>
      <div>
        <span>Forecast</span>
        <strong>{formatTon(data.forecastTon)}</strong>
      </div>
      <div>
        <span>Forecast Achievement</span>
        <strong>{formatPct(data.forecastAchievementPct)}</strong>
      </div>
      <div>
        <span>Remaining Target</span>
        <strong>{formatTon(data.remainingTargetTon)}</strong>
      </div>
      <div>
        <span>Required / Remaining Day</span>
        <strong>{formatTon(data.requiredDailyTon)}</strong>
      </div>
      <p className="forecast-note">
        Working days: {data.workingDaysElapsed} / {data.workingDaysInMonth} (ใช้วันที่มีข้อมูลผลิตเป็น proxy)
      </p>
    </div>
  );
}
