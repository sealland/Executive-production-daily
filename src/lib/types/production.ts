export type AchievementStatus = "green" | "yellow" | "red" | "neutral";

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
  plant?: string;
  line?: string;
  productGroup?: string;
  materialCode?: string;
  shift?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface KpiMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  secondaryLabel?: string;
  secondaryValue?: number | null;
  secondaryUnit?: string;
  achievementPct?: number | null;
  status?: AchievementStatus;
  delta?: number | null;
  deltaLabel?: string;
  placeholder?: boolean;
  note?: string;
}

export interface DailyPoint {
  date: string;
  actualTon: number;
  targetTon: number;
  achievementPct: number | null;
  differenceTon: number;
  ma7Ton: number | null;
  belowTarget: boolean;
}

export interface MonthlyPoint {
  month: number;
  monthLabel: string;
  actualTon: number;
  targetTon: number;
  previousYearTon: number;
  achievementPct: number | null;
  yoyPct: number | null;
}

export interface YearlyPoint {
  year: number;
  actualTon: number;
  targetTon: number;
  yoyPct: number | null;
}

export interface ForecastMetrics {
  mtdActualTon: number;
  monthlyTargetTon: number;
  forecastTon: number;
  forecastAchievementPct: number | null;
  remainingTargetTon: number;
  remainingWorkingDays: number;
  requiredDailyTon: number | null;
  workingDaysElapsed: number;
  workingDaysInMonth: number;
}

export interface PlantRow {
  plant: string;
  actualTon: number;
  targetTon: number;
  achievementPct: number | null;
  sharePct: number | null;
  status: AchievementStatus;
}

export interface LineRow {
  plant: string;
  line: string;
  actualTon: number;
  targetTon: number;
  achievementPct: number | null;
  status: AchievementStatus;
}

export interface ProductRow {
  materialCode: string;
  productName: string;
  productGroup: string | null;
  actualTon: number;
  targetTon: number;
  sharePct: number | null;
  achievementPct: number | null;
  status: AchievementStatus;
}

export interface DowntimeGroupRow {
  category: string;
  minutes: number;
  contributionPct: number;
  cumulativePct: number;
}

export interface DowntimeReasonRow {
  category: string;
  problem: string;
  minutes: number;
  count: number;
}

export interface DowntimeSummary {
  todayMinutes: number;
  previousDayMinutes: number;
  diffMinutes: number;
  groups: DowntimeGroupRow[];
  reasons: DowntimeReasonRow[];
  asOfDate: string | null;
  scopeNote: string | null;
}

export interface LossRow {
  type: string;
  ton: number | null;
  available: boolean;
  note?: string;
}

export interface DetailRow {
  date: string;
  plant: string;
  department: string | null;
  line: string;
  shift: string | null;
  materialCode: string;
  product: string;
  productGroup: string | null;
  size: string | null;
  grade: string | null;
  targetTon: number;
  actualTon: number;
  achievementPct: number | null;
  goodTon: number;
  scrapTon: number;
  rejectTon: number;
  yieldPct: number | null;
  downtimeMin: number | null;
  status: AchievementStatus;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmployeeInfo {
  code: string;
  name: string;
  position: string | null;
}

export interface HighlightRecord {
  reportDate: string;
  plant: string;
  text: string;
  updatedBy: EmployeeInfo;
  updatedAt: string;
}

export interface HighlightHistoryEntry {
  reportDate: string;
  plant: string;
  text: string;
  editedBy: EmployeeInfo;
  editedAt: string;
}

export interface FilterOptions {
  plants: string[];
  lines: { plant: string; line: string }[];
  productGroups: string[];
  products: { materialCode: string; name: string; productGroup: string | null }[];
  sizes: string[];
  grades: string[];
  shifts: string[];
  years: number[];
}
