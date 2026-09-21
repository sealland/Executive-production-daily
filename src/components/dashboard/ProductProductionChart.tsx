"use client";

import type { ProductRow } from "@/lib/types/production";
import { formatPct, formatTon, statusClass, statusLabel } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

export function ProductProductionChart({
  rows,
  onSelect
}: {
  rows: ProductRow[];
  onSelect?: (materialCode: string) => void;
}) {
  if (!rows.length) return <EmptyState />;

  return (
    <div className="table-wrap compact">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Ton</th>
            <th>Share</th>
            <th>Target</th>
            <th>Achievement</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.materialCode}
              className="clickable"
              onClick={() => onSelect?.(row.materialCode)}
            >
              <td>
                <div className="stack-cell">
                  <strong>{row.productName}</strong>
                  <span>{row.materialCode}</span>
                </div>
              </td>
              <td>{formatTon(row.actualTon)}</td>
              <td>{formatPct(row.sharePct)}</td>
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
