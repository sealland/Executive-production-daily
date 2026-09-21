"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardFiltersBar } from "@/components/dashboard/DashboardFilters";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DailyProductionChart } from "@/components/dashboard/DailyProductionChart";
import { MonthlyProductionChart } from "@/components/dashboard/MonthlyProductionChart";
import { YearlyProductionChart } from "@/components/dashboard/YearlyProductionChart";
import { ProductionForecast } from "@/components/dashboard/ProductionForecast";
import { PlantProductionChart } from "@/components/dashboard/PlantProductionChart";
import { LinePerformanceChart } from "@/components/dashboard/LinePerformanceChart";
import { ProductProductionChart } from "@/components/dashboard/ProductProductionChart";
import { DowntimeParetoChart } from "@/components/dashboard/DowntimeParetoChart";
import { ProductionLossChart } from "@/components/dashboard/ProductionLossChart";
import { ProductionDetailTable } from "@/components/dashboard/ProductionDetailTable";
import { EmptyState, ErrorState, LoadingState, Panel } from "@/components/dashboard/PanelStates";
import { fetchJson, toQuery } from "@/lib/api/client";
import { toDateString } from "@/lib/calc/periods";
import { alignDashboardFilters } from "@/lib/query/alignFilters";
import type {
  DailyPoint,
  DashboardFilters,
  DetailRow,
  DowntimeSummary,
  FilterOptions,
  ForecastMetrics,
  KpiMetric,
  LineRow,
  LossRow,
  MonthlyPoint,
  Paginated,
  PlantRow,
  ProductRow,
  YearlyPoint
} from "@/lib/types/production";

const FILTERS_STORAGE_KEY = "production-dashboard-filters-v3";

function defaultFilters(): DashboardFilters {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = toDateString(now);
  return {
    year,
    month,
    startDate,
    endDate,
    page: 1,
    pageSize: 50
  };
}

function readStoredFilters(): DashboardFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardFilters;
    if (!parsed || typeof parsed !== "object") return null;
    return alignDashboardFilters({
      ...defaultFilters(),
      ...parsed,
      page: parsed.page || 1,
      pageSize: parsed.pageSize || 50
    });
  } catch {
    return null;
  }
}

function persistFilters(filters: DashboardFilters) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // ignore quota / private mode
  }
}

function initialFilters(): DashboardFilters {
  return defaultFilters();
}

export function ProductionDashboard() {
  // draft = what the filter bar shows; applied = what the APIs use
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>(initialFilters);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [kpis, setKpis] = useState<KpiMetric[]>([]);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [yearly, setYearly] = useState<YearlyPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastMetrics | null>(null);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [downtime, setDowntime] = useState<DowntimeSummary | null>(null);
  const [loss, setLoss] = useState<LossRow[]>([]);
  const [detail, setDetail] = useState<Paginated<DetailRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(() => toQuery(appliedFilters), [appliedFilters]);

  const applyFilters = useCallback((next: DashboardFilters, options?: { forceReload?: boolean }) => {
    const normalized = alignDashboardFilters({
      ...next,
      page: next.page || 1,
      pageSize: next.pageSize || 50
    });
    setDraftFilters(normalized);
    setAppliedFilters(normalized);
    persistFilters(normalized);
    if (options?.forceReload) {
      setReloadToken((v) => v + 1);
    }
  }, []);

  // Restore last selected filters after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const stored = readStoredFilters();
    if (stored) {
      const aligned = alignDashboardFilters(stored);
      setDraftFilters(aligned);
      setAppliedFilters(aligned);
    }
    setHydrated(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        filterRes,
        summaryRes,
        dailyRes,
        monthlyRes,
        yearlyRes,
        forecastRes,
        plantRes,
        lineRes,
        productRes,
        downtimeRes,
        lossRes,
        detailRes
      ] = await Promise.all([
        fetchJson<FilterOptions>(`/api/production/filters?${query}`),
        fetchJson<{ kpis: KpiMetric[] }>(`/api/production/summary?${query}`),
        fetchJson<{ points: DailyPoint[] }>(`/api/production/daily?${query}`),
        fetchJson<{ points: MonthlyPoint[] }>(`/api/production/monthly?${query}`),
        fetchJson<{ points: YearlyPoint[] }>(`/api/production/yearly?${query}`),
        fetchJson<ForecastMetrics>(`/api/production/forecast?${query}`),
        fetchJson<{ rows: PlantRow[] }>(`/api/production/by-plant?${query}`),
        fetchJson<{ rows: LineRow[] }>(`/api/production/by-line?${query}`),
        fetchJson<{ rows: ProductRow[] }>(`/api/production/by-product?${query}`),
        fetchJson<DowntimeSummary>(`/api/production/downtime?${query}`),
        fetchJson<{ rows: LossRow[] }>(`/api/production/loss?${query}`),
        fetchJson<Paginated<DetailRow>>(`/api/production/detail?${query}`)
      ]);

      setOptions(filterRes);
      setKpis(summaryRes.kpis);
      setDaily(dailyRes.points);
      setMonthly(monthlyRes.points);
      setYearly(yearlyRes.points);
      setForecast(forecastRes);
      setPlants(plantRes.rows);
      setLines(lineRes.rows);
      setProducts(productRes.rows);
      setDowntime(downtimeRes);
      setLoss(lossRes.rows);
      setDetail(detailRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด Dashboard ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load, reloadToken]);

  return (
    <div className="dashboard">
      <header className="hero">
        <div>
          <p className="eyebrow">CEO Production Control</p>
          <h1>Production Executive Dashboard</h1>
          <p className="lede">
            ติดตาม Actual เทียบ Target รายวัน รายเดือน รายปี พร้อมเจาะ Plant / Line / Product และ Downtime
          </p>
        </div>
        <div className="hero-meta">
          <span>แหล่งผลิต: CEO_REPORT</span>
          <span>แหล่งหยุดเครื่อง: Downtime</span>
        </div>
      </header>

      <DashboardFiltersBar
        filters={draftFilters}
        options={options}
        onChange={(next) =>
          setDraftFilters(alignDashboardFilters({ ...next, page: 1 }))
        }
        onPeriodChange={(next) =>
          applyFilters({ ...next, page: 1 }, { forceReload: true })
        }
        onReset={() => {
          applyFilters(defaultFilters(), { forceReload: true });
        }}
        onRefresh={() =>
          applyFilters({ ...draftFilters, page: draftFilters.page || 1 }, { forceReload: true })
        }
      />

      {error ? <ErrorState message={error} /> : null}

      <section className="kpi-grid">
        {loading && !kpis.length
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="kpi-card skeleton">
                <LoadingState />
              </div>
            ))
          : kpis.map((metric) => <KpiCard key={metric.key} metric={metric} />)}
      </section>

      <section className="grid-2">
        <Panel title="Daily Production Trend" subtitle="30 วันล่าสุด · สีแดง ต่ำกว่าเป้า">
          {loading ? <LoadingState /> : <DailyProductionChart points={daily} />}
        </Panel>
        <Panel title="Monthly Production" subtitle="Actual / Target จาก CPP 2026 · Actual ปีก่อน · Label = YoY %">
          {loading ? <LoadingState /> : <MonthlyProductionChart points={monthly} />}
        </Panel>
      </section>

      <section className="grid-2">
        <Panel title="End of Month Forecast" subtitle="ประมาณการจากค่าเฉลี่ยต่อวันทำงาน · เป้าเดือนจาก CPP">
          {loading ? <LoadingState /> : <ProductionForecast data={forecast} />}
        </Panel>
        <Panel title="Yearly Production Trend" subtitle="เป้าปี 2026 จาก Actual CPP · ปีอื่นใช้ prd_goal">
          {loading ? <LoadingState /> : <YearlyProductionChart points={yearly} />}
        </Panel>
      </section>

      <section className="grid-2">
        <Panel title="Production by Plant" subtitle="คลิกเพื่อ drill-down · Achievement อิงเป้า CPP รายโรง">
          {loading ? (
            <LoadingState />
          ) : (
            <PlantProductionChart
              rows={plants}
              onSelect={(plant) =>
                applyFilters({ ...appliedFilters, plant, line: undefined, page: 1 })
              }
            />
          )}
        </Panel>
        <Panel title="Production by Line" subtitle="เรียง Achievement จากต่ำไปสูง">
          {loading ? (
            <LoadingState />
          ) : (
            <LinePerformanceChart
              rows={lines}
              onSelect={(line, plant) =>
                applyFilters({ ...appliedFilters, plant, line, page: 1 })
              }
            />
          )}
        </Panel>
      </section>

      <section className="grid-2">
        <Panel title="Top Production Products" subtitle="Top 10 ตาม Actual Ton">
          {loading ? (
            <LoadingState />
          ) : products.length ? (
            <ProductProductionChart
              rows={products}
              onSelect={(materialCode) =>
                applyFilters({ ...appliedFilters, materialCode, page: 1 })
              }
            />
          ) : (
            <EmptyState />
          )}
        </Panel>
        <Panel title="Downtime Pareto" subtitle="คลิกหมวดเพื่อดู Reason">
          {loading ? <LoadingState /> : <DowntimeParetoChart data={downtime} />}
        </Panel>
      </section>

      <Panel title="Production Loss Analysis" subtitle="โครงสร้างรองรับแล้ว ส่วนที่ยังไม่มีข้อมูลจะแสดง Empty">
        {loading ? <LoadingState /> : <ProductionLossChart rows={loss} />}
      </Panel>

      <Panel title="Production Detail" subtitle="ค้นหา · แบ่งหน้า · Export Excel">
        {loading ? (
          <LoadingState />
        ) : (
          <ProductionDetailTable
            data={detail}
            filters={appliedFilters}
            onPageChange={(page) => applyFilters({ ...appliedFilters, page })}
            onSearch={(search) => applyFilters({ ...appliedFilters, search, page: 1 })}
          />
        )}
      </Panel>
    </div>
  );
}
