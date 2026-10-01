export interface ForecastInput {
  mtdActualTon: number;
  monthlyTargetTon: number;
  workingDaysElapsed: number;
  workingDaysInMonth: number;
}

export interface ForecastResult {
  forecastTon: number;
  forecastAchievementPct: number | null;
  remainingTargetTon: number;
  remainingWorkingDays: number;
  requiredDailyTon: number | null;
  avgDailyTon: number | null;
}

export function calcForecast(input: ForecastInput): ForecastResult {
  const {
    mtdActualTon,
    monthlyTargetTon,
    workingDaysElapsed,
    workingDaysInMonth
  } = input;

  const remainingWorkingDays = Math.max(workingDaysInMonth - workingDaysElapsed, 0);
  const remainingTargetTon = Math.max(monthlyTargetTon - mtdActualTon, 0);
  const avgDailyTon =
    workingDaysElapsed > 0 ? mtdActualTon / workingDaysElapsed : null;
  const forecastTon =
    avgDailyTon === null ? mtdActualTon : avgDailyTon * workingDaysInMonth;
  const forecastAchievementPct =
    monthlyTargetTon > 0 ? (forecastTon / monthlyTargetTon) * 100 : null;
  const requiredDailyTon =
    remainingWorkingDays > 0 ? remainingTargetTon / remainingWorkingDays : null;

  return {
    forecastTon,
    forecastAchievementPct,
    remainingTargetTon,
    remainingWorkingDays,
    requiredDailyTon,
    avgDailyTon
  };
}
