"use client";

import { alignDashboardFilters, monthDateRange } from "@/lib/query/alignFilters";
import type { DashboardFilters, FilterOptions } from "@/lib/types/production";

export function DashboardFiltersBar({
  filters,
  options,
  onChange,
  onPeriodChange,
  onReset,
  onRefresh
}: {
  filters: DashboardFilters;
  options: FilterOptions | null;
  onChange: (next: DashboardFilters) => void;
  onPeriodChange: (next: DashboardFilters) => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  const lines = (options?.lines || []).filter((l) =>
    filters.plant ? l.plant === filters.plant : true
  );
  const products = (options?.products || []).filter((p) =>
    filters.productGroup ? p.productGroup === filters.productGroup : true
  );

  return (
    <section className="filter-bar">
      <div className="filter-grid">
        <label>
          จากวันที่
          <input
            type="date"
            value={filters.startDate || ""}
            onChange={(e) =>
              onPeriodChange(
                alignDashboardFilters({
                  ...filters,
                  startDate: e.target.value || undefined
                })
              )
            }
          />
        </label>
        <label>
          ถึงวันที่
          <input
            type="date"
            value={filters.endDate || ""}
            onChange={(e) =>
              onPeriodChange(
                alignDashboardFilters({
                  ...filters,
                  endDate: e.target.value || undefined
                })
              )
            }
          />
        </label>
        <label>
          ปี
          <select
            value={filters.year || ""}
            onChange={(e) => {
              const year = e.target.value ? Number(e.target.value) : undefined;
              if (year && filters.month) {
                onPeriodChange(alignDashboardFilters(monthDateRange(year, filters.month)));
              } else {
                onPeriodChange(alignDashboardFilters({ ...filters, year }));
              }
            }}
          >
            <option value="">ทั้งหมด</option>
            {(options?.years || []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          เดือน
          <select
            value={filters.month || ""}
            onChange={(e) => {
              const month = e.target.value ? Number(e.target.value) : undefined;
              const year = filters.year || new Date().getFullYear();
              if (month) {
                onPeriodChange(alignDashboardFilters(monthDateRange(year, month)));
              } else {
                onPeriodChange(alignDashboardFilters({ ...filters, month: undefined }));
              }
            }}
          >
            <option value="">ทั้งหมด</option>
            {[
              "ม.ค.",
              "ก.พ.",
              "มี.ค.",
              "เม.ย.",
              "พ.ค.",
              "มิ.ย.",
              "ก.ค.",
              "ส.ค.",
              "ก.ย.",
              "ต.ค.",
              "พ.ย.",
              "ธ.ค."
            ].map((label, i) => (
              <option key={label} value={i + 1}>
                {i + 1} · {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plant
          <select
            value={filters.plant || ""}
            onChange={(e) =>
              onChange({
                ...filters,
                plant: e.target.value || undefined,
                line: undefined
              })
            }
          >
            <option value="">ทั้งหมด</option>
            {(options?.plants || []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Production Line
          <select
            value={filters.line ? `${filters.plant || ""}|${filters.line}` : ""}
            onChange={(e) => {
              const [plant, line] = e.target.value.split("|");
              onChange({
                ...filters,
                plant: plant || filters.plant,
                line: line || undefined
              });
            }}
          >
            <option value="">ทั้งหมด</option>
            {lines.map((l) => (
              <option key={`${l.plant}-${l.line}`} value={`${l.plant}|${l.line}`}>
                {filters.plant ? l.line : `${l.plant} · ${l.line}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product Group
          <select
            value={filters.productGroup || ""}
            onChange={(e) =>
              onChange({
                ...filters,
                productGroup: e.target.value || undefined,
                materialCode: undefined
              })
            }
          >
            <option value="">ทั้งหมด</option>
            {(options?.productGroups || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            value={filters.materialCode || ""}
            onChange={(e) =>
              onChange({ ...filters, materialCode: e.target.value || undefined })
            }
          >
            <option value="">ทั้งหมด</option>
            {products.slice(0, 200).map((p) => (
              <option key={p.materialCode} value={p.materialCode}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shift
          <select
            value={filters.shift || ""}
            onChange={(e) => onChange({ ...filters, shift: e.target.value || undefined })}
          >
            <option value="">ทั้งหมด</option>
            {(options?.shifts || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-actions">
        <button type="button" className="btn ghost" onClick={onReset}>
          Reset Filter
        </button>
        <button type="button" className="btn primary" onClick={onRefresh}>
          Refresh
        </button>
        <span className="filter-hint">
          เปลี่ยนเดือน/วันที่จะโหลดทันที · Plant/Line/Product กด Refresh
        </span>
      </div>
    </section>
  );
}
