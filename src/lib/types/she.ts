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
