# Production Executive Dashboard Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Build a Thai-language Production Executive Dashboard on Next.js that answers production vs target, trends, plant/line gaps, and downtime from live `CEO_REPORT` + `Downtime` databases.

**Architecture:** Next.js App Router UI + Route Handlers; dual `mssql` pools; calculation services; Recharts + TanStack Table. Reporting SQL lives in `/sql` and repositories.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, Recharts, TanStack Table, Lucide, mssql, xlsx, dotenv

## Global Constraints

- Actual = `prd_a`; Target = `TRY_CONVERT(float, prd_goal)` from `tbl_prd_summary_new`
- Plant = large group; Line = `prd_station`
- Downtime from `Downtime.dbo.Downtimes` with approved Group mapping
- OEE placeholder; Yield interim formula
- Same-period YoY/MTD/YTD
- Thai UI, light executive theme
- No commits unless user asks; do not modify `Production_plan`
- Keep `.env` secrets out of git

---

### Task 1: Scaffold Next.js app

**Files:**
- Create: Next.js app files in repo root (merge with existing `.env`, `docs`, `scripts`)
- Keep: `.env`, `.gitignore`, `docs/**`, `scripts/inspect-db.js`

- [ ] Create Next.js TypeScript app with Tailwind, App Router
- [ ] Install: `mssql`, `recharts`, `@tanstack/react-table`, `lucide-react`, `xlsx`, `date-fns`, `clsx`
- [ ] Ensure `.gitignore` covers `.env`, `node_modules`, `.next`
- [ ] Verify `npm run build` baseline

### Task 2: DB clients + shared domain

**Files:**
- Create: `src/lib/db/ceo.ts`, `src/lib/db/downtime.ts`
- Create: `src/lib/types/production.ts`
- Create: `src/lib/constants/downtime-groups.ts`
- Create: `src/lib/format/numbers.ts`, `src/lib/format/status.ts`
- Create: `src/lib/calc/achievement.ts`, `src/lib/calc/forecast.ts`, `src/lib/calc/periods.ts`

- [ ] Dual mssql pools from env
- [ ] Types for filters, KPI, chart series, detail rows
- [ ] Status color helpers and number formatters
- [ ] Unit tests or script checks for achievement/forecast math

### Task 3: Production + Downtime services

**Files:**
- Create: `src/lib/services/filters.ts`
- Create: `src/lib/services/summary.ts`
- Create: `src/lib/services/trends.ts`
- Create: `src/lib/services/breakdowns.ts`
- Create: `src/lib/services/downtime.ts`
- Create: `src/lib/services/detail.ts`
- Create: `sql/reporting-views.sql` (optional view DDL)

- [ ] Aggregate queries against `tbl_prd_summary_new`
- [ ] Downtime aggregates + Pareto + reason drill-down
- [ ] Plant normalization helper

### Task 4: API routes

**Files:**
- Create: `src/app/api/production/*/route.ts` for summary, daily, monthly, yearly, forecast, by-plant, by-line, by-product, downtime, loss, detail, detail/export, filters

- [ ] Parse filters from query
- [ ] Return JSON with explicit empty/null for missing domains
- [ ] Excel export for detail

### Task 5: Dashboard UI

**Files:**
- Create: components under `src/components/dashboard/*`
- Modify: `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`

- [ ] Filter bar + shared filter state
- [ ] 8 KPI cards
- [ ] Charts + forecast + table
- [ ] Loading / empty / error states
- [ ] Drill-down via chart click → filter update

### Task 6: Validate + polish

- [ ] Run `npm run build`
- [ ] Spot-check Today/MTD/YTD/Achievement/YoY/Forecast against SQL samples
- [ ] Confirm Downtime today and Pareto render
- [ ] Document remaining gaps in README

---

## Spec coverage check

- KPI / charts / filters / downtime / detail / export → Tasks 3–5
- OEE placeholder / loss empty → Task 4–5
- Dual DB / mapping → Task 2–3
- Performance aggregates → Task 3
