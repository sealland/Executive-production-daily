"use client";

import type { LineRow } from "@/lib/types/production";
import { formatPct, formatTon, statusClass, statusLabel } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

export function LinePerformanceChart({
  rows,
  onSelect
}: {
  rows: LineRow[];
  onSelect?: (line: string, plant: string) => void;
}) {
  if (!rows.length) return <EmptyState />;

  return (
    <div className="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>Plant</th>
            <th>Actual</th>
            <th>Target</th>
            <th>Achievement</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map((row) => (
            <tr
              key={`${row.plant}-${row.line}`}
              className="clickable"
              onClick={() => onSelect?.(row.line, row.plant)}
            >
              <td>{row.line}</td>
              <td>{row.plant}</td>
              <td>{formatTon(row.actualTon)}</td>
              <td>{formatTon(row.targetTon)}</td>
              <td>{formatPct(row.achievementPct)}</td>
              <td>
                <span className={`pill ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
