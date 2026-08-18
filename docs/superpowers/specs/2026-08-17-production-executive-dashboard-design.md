# Production Executive Dashboard — Design Spec

**Date:** 2026-08-17  
**Status:** Approved for implementation  
**Project:** `D:\2026\Oat\Production_report`

## 1. Goal

ให้ผู้บริหารเปิดหน้าเดียวแล้วตอบได้ว่า:

- ตอนนี้สถานการณ์การผลิตเป็นอย่างไร
- ได้ตาม Target หรือไม่
- ถ้าไม่ได้ ปัญหาอยู่ที่ Plant / Line / Product / Downtime ใด
- เดือนนี้มีแนวโน้มจบที่เท่าไร

## 2. Confirmed Decisions

| Topic | Decision |
|---|---|
| App stack | Next.js (App Router) + TypeScript + Tailwind + Recharts + TanStack Table + Lucide |
| Data access | Prisma for SQL Server connection; parameterized aggregate queries / reporting views |
| Production DB | `CEO_REPORT` (env: `SQL_SERVER_*`) |
| Downtime DB | `Downtime` (env: `SQL_DOWNTIME_*`, table `dbo.Downtimes`) |
| Actual Ton | `tbl_prd_summary_new.prd_a` |
| Target Ton | Daily/line: `prd_goal`. Monthly/YTD/Yearly plant+company for 2026: CPP sheet `สรุป` (`Actual CPP 2026`) via `data/cpp-targets-2026.json` |
| Grade B | `prd_b` |
| Reject/Scrap | `prd_r` |
| Plant | Large plant group (e.g. OCP / SPS / OPS / RMD8) |
| Line | `prd_station` |
| Yield (interim) | `prd_a / (prd_a + prd_b + prd_r) * 100` until material input exists |
| OEE | Placeholder / empty until reliable source exists |
| Downtime Group map | See section 5 |
| Language | Thai |
| Theme | Light executive industrial |
| Reuse from Production_plan | Patterns only (config, service/query split, parameterized SQL, Excel export). No shared runtime. |

## 3. Architecture

```
Browser (Dashboard)
  → Next.js Route Handlers `/api/production/*`
    → services (KPI / trend / forecast / downtime calculations)
      → repositories (CEO_REPORT + Downtime pools)
        → SQL Server views/queries
```

### Principles

- Aggregate in database/backend, not in the browser for large facts
- Explicit mock/empty for missing domains (OEE, loss ton without rate)
- Never silent-fallback mock as if live
- Keep Frontend / API / Service / Query separated
- Do not modify legacy tables; prefer reporting views in `CEO_REPORT` where useful

## 4. Data Sources & Field Mapping

### 4.1 Production fact — `dbo.tbl_prd_summary_new`

| Dashboard field | Source |
|---|---|
| Date | `prd_date` |
| Plant (raw) | `prd_plant` → normalize to large plant |
| Line | `prd_station` |
| Product / type | `prd_type` / `internal_name` |
| Material | `material_code` |
| Size | `prd_size` (may be empty; fallback from `prd_type`) |
| Actual Ton | `prd_a` |
| Target Ton | `TRY_CONVERT(float, prd_goal)` |
| Grade B Ton | `prd_b` |
| Reject Ton | `prd_r` |

Coverage: ~44k rows, actual from 2020-07 to current.

### 4.2 Plant master — `dbo.tbl_plant`

`WERKS`, `PLANT` used to normalize plant labels.

### 4.3 Product group — `dbo.tbl_matgroup`

Map material prefix / group code → `mat_group_name`, `product_group`.

### 4.4 Downtime — `Downtime.dbo.Downtimes`

| Dashboard field | Source |
|---|---|
| Start / End | `StartTime`, `EndTime` |
| Minutes | `Minute` |
| Plant | `Station` (OCP, RMD8, …) |
| Line | `Machine` (I1, C5, MR8, …) |
| Group code | `[Group]` |
| Reason | `Problem`, `Cause` |
| Shift | `shift` |
| Code | `Code` |

Coverage: ~178k rows since 2019-09.

### 4.5 Missing / deferred

| Domain | Handling |
|---|---|
| OEE | KPI card placeholder + `null` API fields |
| Input Material Ton | Yield uses interim formula |
| Production Calendar | Forecast uses days-with-production as working-day proxy |
| Department filter | Hide or disable until source exists |
| Grade filter | Use available grade-like fields if present; else optional |
| Loss as Ton | Empty / estimate later if ton/hour rate available |

## 4.6 Line ↔ Machine Mapping

`prd_station` (CEO_REPORT) and `Machine` (Downtime) never share a value, so every
downtime query translates the selected line first. Implemented in
`src/lib/constants/line-machine.ts`.

| Plant | Production line | Downtime machine | Rule |
|---|---|---|---|
| OCP | `ท่อดำ#N` | `IN` | Name prefix + number |
| OCP | `ตัวซี#N` | `CN` | Name prefix + number |
| RMD7 | `CD2`, `CD3` | `MR7` | Plant-level: one machine per plant |
| RMD8 | `CD3` | `MR8` | Plant-level: one machine per plant |
| SMD / MSM | `60` | `MSM` | Plant-level: SMD = MSM (same plant) |

Because line names such as `CD3` exist in more than one plant, the line filter
always carries its plant from the UI. For plant-level plants the dashboard shows
a note that downtime cannot be narrowed below plant. Machines that exist only in
the downtime database (`P1`, `S1`, `S3`) are reachable only when no line filter
is applied.

## 5. Downtime Group Mapping

| Legacy codes | Executive category (TH) |
|---|---|
| `MM`, `M` | เครื่องกล |
| `EE`, `EM`, `E` | ไฟฟ้า |
| `PD`, `P`, `PP` | กระบวนการ |
| `SETUP`, `SET UP`, `CHANGE SIZE`, `PM-เลื่อนร่อง` | Changeover |
| `PM` | งานแผน |
| `QA` | คุณภาพ |
| `UTD` | Utility |
| `IT`, `Other`, `TEST`, `null`, unknown | อื่น ๆ |

## 6. API Contract

All accept filters: `startDate`, `endDate`, `year`, `month`, `plant`, `line`, `productGroup`, `materialCode`, `shift`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/production/filters` | Cascading filter options |
| GET | `/api/production/summary` | 8 KPI values + status |
| GET | `/api/production/daily` | ≥30 day actual/target/MA7 |
| GET | `/api/production/monthly` | Jan–Dec current vs target vs previous year |
| GET | `/api/production/yearly` | ≥5 years if available |
| GET | `/api/production/forecast` | EOM forecast metrics |
| GET | `/api/production/by-plant` | Ton, achievement, share |
| GET | `/api/production/by-line` | Sorted by achievement ascending |
| GET | `/api/production/by-product` | Top 10 |
| GET | `/api/production/downtime` | Today + Pareto + reasons |
| GET | `/api/production/loss` | Available loss breakdown or empty |
| GET | `/api/production/detail` | Paginated detail + export query |
| GET | `/api/production/detail/export` | Excel |

### Calculation rules

- Achievement % = Actual / Target × 100 (null if Target ≤ 0)
- Status: green ≥100, yellow 95–99.99, red <95
- YoY / MTD / YTD use **same-period** comparison only
- Forecast:
  - Working days elapsed = distinct production dates in month to date
  - Avg daily = MTD actual / working days elapsed
  - Forecast = avg daily × expected working days in month (proxy: distinct historical pattern or calendar days minus known zero-plan days; document proxy in UI)
  - Required per remaining day = remaining target / remaining working days
- 7-day MA on daily actual

## 7. Frontend Components

```
app/
  page.tsx                          # Dashboard shell
  api/production/*/route.ts
components/dashboard/
  DashboardFilters.tsx
  KpiCard.tsx
  DailyProductionChart.tsx
  MonthlyProductionChart.tsx
  YearlyProductionChart.tsx
  ProductionForecast.tsx
  PlantProductionChart.tsx
  LinePerformanceChart.tsx
  ProductProductionChart.tsx
  DowntimeParetoChart.tsx
  ProductionLossChart.tsx
  ProductionDetailTable.tsx
  LoadingSkeleton.tsx
  EmptyState.tsx
  ErrorState.tsx
lib/
  db/ceo.ts
  db/downtime.ts
  services/production*.ts
  mappers/*
  format/*
  constants/downtime-groups.ts
```

### Layout

1. Filters  
2. KPI row (8 cards, wrap on tablet)  
3. Daily | Monthly  
4. Forecast | Yearly  
5. Plant | Line  
6. Product | Downtime Pareto  
7. Loss  
8. Detail table  

### UX states

Every panel supports loading skeleton, empty, and error.  
Chart click updates shared filter state (drill-down).

### Number formats

- Ton: `1,245 T`  
- %: `95.8%`  
- Downtime: `82 min`  
- YoY: `+4.2%` / `-3.8%`

## 8. Reporting Views (CEO_REPORT)

Create read-only views (no legacy table rewrite):

- `vw_exec_production_daily`
- `vw_exec_production_monthly`
- `vw_exec_kpi_base`
- `vw_exec_by_plant`
- `vw_exec_by_line`
- `vw_exec_by_product`
- `vw_exec_detail`

If DBA permission blocks view creation, ship equivalent SQL inside repositories first, keep view scripts in `/sql`.

## 9. Security & Ops

- `.env` gitignored; never commit secrets
- Separate pools for CEO_REPORT and Downtime
- Parameterized SQL only
- No request-supplied actor identity required for v1 read-only dashboard
- Excel export server-side

## 10. Implementation Phases

1. Scaffold Next.js app + DB clients + shared types  
2. SQL/scripts + repositories + calculation services  
3. API routes  
4. Dashboard UI with live production + downtime  
5. Detail table + export  
6. Validation of MTD/YTD/YoY/Forecast/Achievement  
7. Polish empty/placeholder domains  

## 11. Out of Scope (v1)

- Write-back to production/downtime systems  
- Full OEE engine  
- Auth/SSO (can add later)  
- Mobile phone optimization beyond basic wrap  
- Changing Production_plan project  

## 12. Open Follow-ups (non-blocking)

- Official Machine ↔ `prd_station` dictionary to replace the name-pattern rules in section 4.6  
- Per-line downtime logging for RMD7 / RMD8 / SMD  
- Backfill `[Group]` on downtime rows where it is `NULL` (currently lands in "อื่น ๆ")  
- Material input ton for true Yield  
- Ton/hour rate for downtime loss in tons  
- Production calendar / holidays  
