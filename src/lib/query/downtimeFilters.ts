import { sql } from "@/lib/db/downtime";
import { resolveDowntimeMachines } from "@/lib/constants/line-machine";
import { downtimeStationsForPlant, normalizePlant } from "@/lib/constants/plants";
import type { DashboardFilters } from "@/lib/types/production";

/**
 * Build the WHERE conditions for the Downtime database from dashboard filters.
 * Line names have to be translated into machine codes first.
 */
export function buildDowntimeConditions(
  request: sql.Request,
  filters: DashboardFilters
): string[] {
  const conditions: string[] = [];

  if (filters.plant) {
    const stations = downtimeStationsForPlant(filters.plant);
    if (stations.length === 1) {
      request.input("plant", sql.NVarChar, stations[0]);
      conditions.push("LTRIM(RTRIM(Station)) = @plant");
    } else if (stations.length > 1) {
      const params = stations.map((station, index) => {
        request.input(`plant${index}`, sql.NVarChar, station);
        return `@plant${index}`;
      });
      conditions.push(`LTRIM(RTRIM(Station)) IN (${params.join(", ")})`);
    }
  }

  const machines = resolveDowntimeMachines(normalizePlant(filters.plant), filters.line);
  if (machines.length) {
    const params = machines.map((machine, index) => {
      request.input(`machine${index}`, sql.NVarChar, machine);
      return `@machine${index}`;
    });
    conditions.push(`LTRIM(RTRIM(Machine)) IN (${params.join(", ")})`);
  }

  if (filters.shift) {
    request.input("shift", sql.NVarChar, filters.shift.trim());
    conditions.push("LTRIM(RTRIM(shift)) = @shift");
  }

  return conditions;
}
