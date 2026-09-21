"use client";

import type { DetailRow, Paginated } from "@/lib/types/production";
import { formatPct, formatTon, statusClass, statusLabel } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";
import { toQuery } from "@/lib/api/client";
import type { DashboardFilters } from "@/lib/types/production";

export function ProductionDetailTable({
  data,
  filters,
  onPageChange,
  onSearch
}: {
  data: Paginated<DetailRow> | null;
  filters: DashboardFilters;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
}) {
  if (!data) return <EmptyState />;
  if (!data.rows.length) return <EmptyState />;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const exportUrl = `/api/production/detail/export?${toQuery(filters)}`;

  return (
    <div>
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="ค้นหา Material / Line / Product"
          defaultValue={filters.search || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch((e.target as HTMLInputElement).value);
          }}
        />
        <a className="btn primary" href={exportUrl}>
          Export Excel
        </a>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Plant</th>
              <th>Line</th>
              <th>Material</th>
              <th>Product</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Ach%</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={`${row.date}-${row.line}-${row.materialCode}-${idx}`}>
                <td>{row.date}</td>
                <td>{row.plant}</td>
                <td>{row.line}</td>
                <td>{row.materialCode}</td>
                <td>{row.product}</td>
                <td>{formatTon(row.targetTon)}</td>
                <td>{formatTon(row.actualTon)}</td>
                <td>{formatPct(row.achievementPct)}</td>
                <td>
                  <span className={`pill ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button
          type="button"
          className="btn ghost"
          disabled={data.page <= 1}
          onClick={() => onPageChange(data.page - 1)}
        >
          ก่อนหน้า
        </button>
        <span>
          หน้า {data.page} / {totalPages} · {data.total.toLocaleString()} รายการ
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={data.page >= totalPages}
          onClick={() => onPageChange(data.page + 1)}
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}
