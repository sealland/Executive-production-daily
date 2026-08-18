# Production Executive Dashboard

Dashboard สำหรับผู้บริหาร ติดตาม Production Actual เทียบ Target จาก `CEO_REPORT` และ Downtime จากฐาน `Downtime`

## Quick start

1. ตั้งค่า `.env` (มีตัวอย่างใน `.env.example`)
2. `npm install`
3. `npm run dev`
4. เปิด [http://localhost:3000](http://localhost:3000)

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run db:inspect` — inspect CEO_REPORT coverage

## Confirmed business rules

- Actual = `tbl_prd_summary_new.prd_a`
- Target = `TRY_CONVERT(float, prd_goal)`
- Plant = large group; Line = `prd_station`
- `prd_b` = Grade B, `prd_r` = Reject
- OEE = placeholder
- Yield interim = `prd_a / (prd_a + prd_b + prd_r)`

## Docs

- Spec: `docs/superpowers/specs/2026-08-17-production-executive-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-08-17-production-executive-dashboard.md`
