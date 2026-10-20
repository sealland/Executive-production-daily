import type { EmployeeInfo } from "@/lib/types/production";

export interface LtiStatus {
  lastLtiDate: string | null;
  daysWithoutLti: number | null;
  updatedBy: EmployeeInfo | null;
  updatedAt: string | null;
}

export interface LtiHistoryEntry {
  lastLtiDate: string;
  editedBy: EmployeeInfo;
  editedAt: string;
}

export type IncidentStatus = "resolved" | "monitoring";

export interface SheIncident {
  id: number;
  reportDate: string;
  plant: string | null;
  title: string;
  description: string | null;
  location: string | null;
  occurredTime: string | null;
  status: IncidentStatus;
  createdBy: EmployeeInfo;
  createdAt: string;
  updatedBy: EmployeeInfo | null;
  updatedAt: string | null;
}

export interface SheIncidentHistoryEntry {
  incidentId: number;
  title: string;
  description: string | null;
  location: string | null;
  occurredTime: string | null;
  status: IncidentStatus;
  action: "created" | "updated";
  editedBy: EmployeeInfo;
  editedAt: string;
}

export interface SheSummaryIncident {
  incidentNo: number;
  occurredDate: string;
  plant: string;
  category: string;
  severity: string | null;
  detailShort: string | null;
}

export interface ShePlantCount {
  plant: string;
  count: number;
}

export interface SheMonthCategoryCount {
  month: number;
  category: string;
  count: number;
}

export interface ShePlantSummary {
  plant: string;
  ytdCount: number;
  pdYtdCount: number;
  lastInjuryDate: string | null;
  lastInjuryCategory: string | null;
  lastLtiTriDate: string | null;
  lastLtiTriCategory: string | null;
  latestDate: string | null;
  latestCategory: string | null;
  latestDetailShort: string | null;
}

export interface SheSummaryResponse {
  asOfDate: string;
  lastImportedAt: string | null;
  lastImportedBy: string | null;
  dataThroughDate: string | null;
  ytd: Record<string, number>;
  mtd: Record<string, number>;
  day: Record<string, number>;
  byPlantYtd: ShePlantCount[];
  byPlant: ShePlantSummary[];
  byMonthYtd: SheMonthCategoryCount[];
  latestIncidents: SheSummaryIncident[];
}

export interface LtiStatusSource {
  source: "manual" | "excel" | "none";
}

export type LtiStatusWithSource = LtiStatus & LtiStatusSource;
