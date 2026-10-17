# ที่มาช่อง Target RMD7 (Executive Report)

เอกสารสำหรับตรวจย้อนที่มาเป้าหมาย — **ไม่แก้ logic** (T-013). หน้าที่โอ๊ตอ้าง: `/executive-report` → `public/executive-report/index.html`

---

## 1) ลำดับข้อมูล (พร้อม file:line)

### A) หน้า Executive Report (ช่อง Target RMD7 ที่โหลดจริง) — **ไม่ใช้ CPP**

```
index.html:103 (placeholder "300 t")
  → app.js:458  GET /api/production/daily-plant-summary?date=...
  → app.js:419  แสดง row.targetTon + " t"
  → route.ts:10  getDailyPlantSummary(date)
  → dailyPlantSummary.ts:29  SUM(ISNULL(TRY_CONVERT(float, prd_goal), 0)) ต่อ prd_date = @d (WHERE :31-32, prd_plant ผ่าน PROD_PLANT_CODE :18)
  → dbo.tbl_prd_summary_new (CEO_REPORT, pool getCeoPool :21)
```

**สรุป:** `targetTon` รายวัน = **ผลรวม `prd_goal` ของทุกแถว RMD7 ในวันนั้น** (หน่วยตามที่ DB เก็บ — โอ๊ตระบุ **ตัน/วัน**). **ไม่มี** import `src/lib/cpp/targets.ts` ใน `dailyPlantSummary.ts` และ **ไม่หาร** จากเป้า CPP รายเดือน.

### B) ท่อ CPP (ใช้กับ Dashboard API อื่น ไม่ใช่ daily-plant-summary)

```
Excel CPP\Zubb CPP Jan-Dec26.xlsm sheet "สรุป" แถว MR7→RMD7
  → sync-cpp-targets.js:9 (MAP), :19 (sheet), :52-69 (อ่านแถว/เดือน)
  → npm run cpp:sync → data/cpp-targets-2026.json
  → targets.ts:158-182 loadCppTargets() (JSON ก่อน, ไม่มี JSON ค่อย xlsm)
  → getCppPlantPeriodTarget :268-274 / getCppMonthlyTarget :196-217
  → breakdowns.ts:71-74, summary.ts:120-124, trends.ts:132-134 (เมื่อเข้าเงื่อนไข CPP)
  → API เช่น /api/production/by-plant, /summary (ไม่ใช่ executive-report)
```

---

## 2) UI และ API ของช่อง Target RMD7

| ชั้น | ตำแหน่ง |
|------|---------|
| UI | `public/executive-report/index.html:72-103` — panel `data-plant-key="rmd7"`, label Target ที่ `.s-value` |
| โหลดข้อมูล | `public/executive-report/app.js:457-465` — map `row.plant` → panel |
| แสดงค่า | `public/executive-report/app.js:418-419` — `fmtTon(row.targetTon) + " t"` |
| API | `src/app/api/production/daily-plant-summary/route.ts:4-11` — query param `date` (บังคับ) |
| Service | `src/lib/services/dailyPlantSummary.ts:20-63` — RMD7 จาก `PROD_PLANT_CODE` :18, `targetTon: prod.targetTon` :56 |

---

## 3) กฎใช้ CPP vs fallback `prd_goal` (Dashboard — อ้าง `breakdowns.ts`)

ใช้กับ **`getByPlant()`** และ service ที่เรียก `getCpp*` แบบเดียวกัน — **ไม่ใช้กับ `getDailyPlantSummary`**

| เงื่อนไข | แหล่ง target |
|----------|----------------|
| ไม่มี filter `line`, `materialCode`, `productGroup` **และ** `startYear === endYear` | CPP จาก JSON/xlsm (`getCppPlantPeriodTarget` :71-72) |
| นอกเหนือเงื่อนไขด้านบน | `SUM(prd_goal)` จาก DB (`TARGET_EXPR` ใน `productionFilters.ts:9`) |
| รวมสุดท้าย | `targetTon = cppTarget ?? dbTarget` (`breakdowns.ts:74`) |

`canUseCppTarget`: `breakdowns.ts:19-21` · `useCpp`: `breakdowns.ts:52` · สรุป/เทรนด์: `summary.ts:120-124`, `trends.ts:132-134`, `229-232`

---

## 4) ค่า RMD7 รายเดือนใน snapshot CPP (`data/cpp-targets-2026.json`)

`exportedAt`: 2026-08-17 · รวมปี `byPlantYear.RMD7` = **132,000** (หน่วยในไฟล์ = **ตัน/เดือน** ตามแผน CPP ไม่ใช่ตัน/วันของ executive-report)

| เดือน | 1 | 2 | 3 | 4 | 5 | 6 | **7** | 8 | 9 | 10 | 11 | 12 |
|-------|---|---|---|---|---|---|-------|---|---|----|----|-----|
| ตัน | 12,000 | 12,000 | 12,000 | 12,000 | 12,000 | 12,000 | **0** | 12,000 | 12,000 | 12,000 | 12,000 | 12,000 |

**ก.ค. = 0** → ถ้าใช้ CPP ใน Dashboard จะทำให้ `calcAchievementPct` คืน `null` เมื่อ target ≤ 0 (`calc/achievement.ts:4`). หน้า executive-report **ไม่ใช้** ค่านี้โดยตรง.

---

## 5) จุดที่ต้องแก้ถ้าตัวเลขไม่ตรง (เปิดการ์ดแก้ logic)

| ประเด็น | ไฟล์:บรรทัด |
|---------|-------------|
| เป้ารายวัน RMD7 บน executive-report (แหล่งจริงวันนี้) | `dailyPlantSummary.ts:25-34` (SQL `prd_goal`), `:56` (ส่ง `targetTon`) |
| ถ้าต้องการใช้ CPP/แหล่งอื่นแทน DB ในหน้านี้ | เพิ่ม logic ใน `dailyPlantSummary.ts` (ปัจจุบันไม่มี) หรือเปลี่ยน ETL ที่เติม `prd_goal` |
| แสดงผล / วันที่รายงาน | `app.js:458`, `:419`; placeholder `index.html:103` |
| เป้าแบบรายเดือน/ตาราง by-plant (Dashboard) | `breakdowns.ts:52-74`, `targets.ts:158-182`, sync `scripts/sync-cpp-targets.js` + `data/cpp-targets-2026.json` |
| สูตร achievement | `dailyPlantSummary.ts:48` (target≤0 → null), `calc/achievement.ts:4` |

**หมายเหตุโอ๊ต:** CPP น่าจะไม่ใช้แล้วสำหรับหน้านี้ — สอดคล้องโค้ด: route daily **ไม่เรียก CPP**; ตัวเลขบนจอมาจาก **`prd_goal` รายวันใน DB** เท่านั้น.

---

## 6) ที่มา 352.0 (16/10/2026)

**ข้อเท็จจริงจากการ์ด (ไม่ต้องคำนวณใหม่):** วันที่รายงาน `2026-10-16` หน้า Executive Production Report แสดง **Target RMD7 = 352.0** (หน่วยแสดง `t`, ทศนิยม 1 ตำแหน่ง — `app.js:402-403`, `:419`). ค่านี้มาจาก API `GET /api/production/daily-plant-summary?date=2026-10-16` → `getDailyPlantSummary` → **`SUM(ISNULL(TRY_CONVERT(float, prd_goal), 0))`** สำหรับ `prd_plant = 'RMD7'` และ `prd_date = @d` (`dailyPlantSummary.ts:25-34`, `:56`). **ไม่ใช้ CPP** (`dailyPlantSummary.ts` ไม่ import `targets.ts`).

### 6a) SQL ตรวจแถวต้นทาง (read-only, parameterized)

รันผ่าน pool เดียวกับแอป (`getCeoPool` / `CEO_REPORT`). ไม่มี DDL/DML. คอลัมน์ line / material ตาม spec §4.1 (`docs/superpowers/specs/2026-08-17-production-executive-dashboard-design.md:63-65`) และ `detail.ts:71-73`, `inspect-db.js:102-103`. ตาราง `tbl_prd_summary_new` **ไม่มีคอลัมน์ shift ใน repo** — กะอยู่ที่ `plan_all.prdtime` (`planWindow.ts:173`) ไม่ถูก JOIN ใน daily-plant-summary.

```sql
-- @p = N'RMD7', @d = '2026-10-16' (sql.NVarChar / sql.Date ตาม mssql driver)
SELECT TOP (50)
  prd_plant,
  prd_date,
  prd_station,
  material_code,
  prd_type,
  internal_name,
  prd_size,
  prd_goal,
  prd_a,
  ISNULL(TRY_CONVERT(float, prd_goal), 0) AS targetTon_row
FROM dbo.tbl_prd_summary_new
WHERE prd_plant = @p
  AND prd_date = @d
ORDER BY prd_station, material_code;
```

**เทียบผลรวมกับ 352.0 (query แยก, ไม่เกิน 1 แถวผลลัพธ์):**

```sql
SELECT
  COUNT(1) AS row_count,
  SUM(ISNULL(TRY_CONVERT(float, prd_goal), 0)) AS targetTon_sum,
  SUM(ISNULL(prd_a, 0)) AS actualTon_sum
FROM dbo.tbl_prd_summary_new
WHERE prd_plant = @p
  AND prd_date = @d;
```

รันแล้ว (2026-10-17, read-only, ผ่าน `getCeoPool` ด้วยสคริปต์ชั่วคราวใน scratchpad ไม่เพิ่มไฟล์ใน repo; พร้อม `INFORMATION_SCHEMA.COLUMNS` ตรวจชนิดคอลัมน์ 1 ครั้ง) — ผลตามตารางด้านล่าง.

**ขอบเขตโหลดข้อมูล:** ทั้งสองคำสั่งกรอง `prd_plant` + `prd_date` (แถวสูงสุด 50 ในแบบแรก); ไม่มี loop ต่อวัน. Index แนะนำ: `(prd_plant, prd_date)` INCLUDE (`prd_goal`, `prd_a`) — ให้ DBA ตัดสินใจ.

### 6b) ผลรวมแถว RMD7 วันที่ 2026-10-16

| prd_station | material_code | prd_type / internal_name | prd_goal (raw) | targetTon_row | prd_a |
|-------------|---------------|-------------------------|----------------|---------------|-------|
| CD2 | DBM1S401201000 | DB12 mm.SD40 / DB12 mm.SD40 (size 10m.) | `352` (nvarchar) | 352 | 366.302 |

**จำนวนแถวที่ถูก SUM: 1 แถว** (ไม่ถึง 50 — ไม่ถูก truncate)
**ผลรวม `targetTon_sum` = 352 vs 352.0 บนจอ: ตรงกัน (ต่าง 0.0)**. `actualTon_sum` (prd_a) = 366.302.

ชนิดคอลัมน์ (INFORMATION_SCHEMA): `prd_date` = **date** (ไม่มีเวลา), `prd_goal` = **nvarchar**, `prd_a` = float, `prd_plant` = nvarchar.

แถว `prd_plant` ของวัน 2026-10-16 (ทุก plant, นับแถว): OCP 7, RMD7 1, RMD8 2, SMD 1 — ไม่มี `MR7`.

### 6c) Verdict สมมติฐาน H1–H8 (จากโค้ด; ต้องมีข้อมูล DB จึงปิด H1/H2/H6/H8)

| ID | สมมติฐาน | Verdict | เหตุผล (อ้าง file:line) |
|----|----------|---------|-------------------------|
| H1 | SUM `prd_goal` ทุกแถว → double-count ถ้าเป้าซ้ำทุกแถว | **ปัดตก (สำหรับวัน 16/10/2026)** | มีแถวเดียว (§6b) จึงไม่มีการ double-count ในวันนี้. ความเสี่ยงยังมีในวันที่มีหลายแถว (`dailyPlantSummary.ts:29`, `GROUP BY prd_plant` `:33`) — รอคำตอบ §6d ข้อ 2 |
| H2 | `prd_date = @d` ไม่ match datetime | **ปัดตก** | `prd_date` เป็น `date` (§6b) และ query คืน 1 แถวด้วย `prd_date = @d` (`dailyPlantSummary.ts:24`, `:32`). ไม่ใช่สาเหตุของ 352.0 |
| H3 | วันผลิต 09:00→09:00 vs `prd_date` ปฏิทิน | **ยืนยัน (โค้ด): daily-summary ไม่ใช้ plan window** / **ยังไม่รู้ (ETL)** | Downtime/summary ใช้ `planWindow.ts` (09:00 กฎ `:80-81`); **`getDailyPlantSummary` ใช้เฉพาะ `prd_date` ตรงกับ query param** (`dailyPlantSummary.ts:32`, `route.ts:6-10`) ไม่เรียก `planWindow`. ว่า ETL ใส่ `prd_date` ตรงกับ “วันรายงาน” ของโรงงานหรือไม่ — รอโอ๊ต/หน้างาน |
| H4 | `prd_goal` varchar → TRY_CONVERT ล้มเหลว = 0 | **ปัดตก สำหรับแถวนี้** (`prd_goal` = `"352"` แปลงได้ ไม่ได้เป็น 0) / ความเสี่ยงยังมีในแถวอื่น | `TRY_CONVERT(float, prd_goal)` (`dailyPlantSummary.ts:29`, `productionFilters.ts:9`). ไม่มีแถวที่แปลงไม่ได้ในวันนี้ (§6b มีแถวเดียว) |
| H5 | หน่วย `prd_goal` อาจไม่ใช่ตัน | **ยังไม่ยืนยันหน่วย (ค่าอยู่ระดับเดียวกับ `prd_a` ตัน)** | ส่งผลรวมตรงเป็น `targetTon` (`dailyPlantSummary.ts:56`); UI ต่อ `" t"` (`app.js:419`). `prd_goal` 352 กับ `prd_a` 366.302 ขนาดใกล้กันบ่งว่าเป็นตัน แต่ยังต้องถามหน่วยจริง (§6d ข้อ 1) |
| H6 | วันหยุด/หยุดซ่อมยังมี `prd_goal` | **ปัดตก สำหรับวันนี้ (แถวเดียวเป็นแถวผลิตจริง DBM1 ที่ CD2)** / ยังไม่รู้ทุกวัน | Query ไม่กรอง `material_code` / `prd_type` / `prd_a` (`dailyPlantSummary.ts:30-32`) แต่ผลวันนี้ไม่มีแถวหยุด |
| H7 | ไม่มีแถว → แสดง 0 t แทน “ไม่มีแผน” | **ยืนยัน (โค้ด)** | ไม่มีแถว → `byProdPlant.get` fallback `{ targetTon: 0 }` (`dailyPlantSummary.ts:45`); `achievementPct` null เมื่อ target≤0 (`:48`); UI ยัง `fmtTon(0)` → `"0.0 t"` (`app.js:402-403`, `:419`) |
| H8 | รหัส plant ในตารางไม่ตรง `RMD7` | **ปัดตก สำหรับวันนี้**: `RMD7` มี 1 แถวใน DB; ไม่มี `MR7` ในวัน 16/10 | `PROD_PLANT_CODE.RMD7 = 'RMD7'` (`dailyPlantSummary.ts:18`); `WHERE prd_plant IN ('RMD7',...)` (`:31`). แมป `MR7→RMD7` มีแค่ใน CPP sync (`scripts/sync-cpp-targets.js:9`) ไม่ใช่ใน query นี้ — ถ้า DB เก็บ `MR7` ในวันอื่นจะไม่ถูก SUM (ยังไม่ได้ตรวจวันอื่น) |

### 6d) คำถามที่ต้องถามหน้างาน

1. เป้า RMD7 วันที่ **16/10/2026** ที่หน้างานใช้เป็น **กี่ตัน/วัน** และมาจาก **แหล่งไหน** (Excel แผนผลิต, `plan_all`, คนบอก, หรือตารางอื่น)?
2. ใน `tbl_prd_summary_new` วันนั้น **หนึ่งวันมีกี่แถว** (ต่อ line / material)? **`prd_goal` ใส่ต่อแถว (SUM ได้) หรือซ้ำเป้ารวมโรงงานทุกแถว?**
3. **`prd_date` ในตาราง** = วันปฏิทินหรือ “วันผลิต” 09:00→09:00 ตามที่ใช้กับ downtime?
4. ตัวเลข **352.0** ที่เห็นบน Executive Report — หน้างานมองว่า **สูงเกิน / ต่ำเกิน / ไม่รู้** เทียบกับเป้าจริง? (ช่วยแยก H1 vs H4/H5)
5. วันไม่มีแผน/วันหยุด ต้องการให้ระบบแสดง **0** หรือ **"-"** (การ์ดแก้ UI รอบถัดไป — AC 5)?

---

## 7) RMD7 Yield (T-003, v0.3.0)

### ที่มา Actual (`prd_a`) และ Target (`prd_goal`)

| ช่อง | แหล่ง | ท่อข้อมูล (read-only อ้างอิง) |
|------|--------|-------------------------------|
| **Actual** `prd_a` | SAP goods receipt เกรดไม่ใช่ B (BWART 101−102) | SQL Agent job `copy_tableauplan_new` → step `copy_rmd7CD2` → `vw_tableau_plan_rmd7` → `hanadev.v_rmd7_production` → SAP `ZZPPRMD52` → เติม `tbl_prd_summary_new.prd_a` ผ่าน ETL CEO_REPORT |
| **Target** `prd_goal` | แผนรายวัน (ตัน/วัน) | `plan_all.ton` (และแถวสรุปใน `tbl_prd_summary_new`) — executive-report ใช้ `SUM(TRY_CONVERT(float, prd_goal))` ไม่ใช้ CPP |

**ไม่แก้** Actual/Target ในการ์ด T-003; แก้เฉพาะนิยาม Yield บน `/executive-report`.

### สูตร Yield ชั่วคราว (RMD7 เท่านั้น) — **PROVISIONAL** (2026-10-17)

**เหตุผล:** ยังไม่มีข้อสรุปจากหน้างาน; โอ๊ตอนุมัติสูตรชั่วคราวจากเฉลยหน้างาน 16/10 (96.9% = 366.302 ÷ 378.046 t) แทนสูตร schedule × line เดิม

- **RM ใช้จริง (ตัน)** = `SUM(rmd_weight) / 1000` จาก `dbo.tbl_rmd_weight_line` ต่อวัน `rmd_date` (ทุก period ทุกเกรด รวม QI/TEST/กะ D)
- กรองใน SQL เท่านั้น: ไม่นับ tag ยกเลิก `ISNULL(rmd_tis_check,'') = 'X'` และ `rmd_weight <= 0`
- **Yield %** = **`prd_a` (actualTon) ÷ rmWeightTon × 100** (ปัดทศนิยม 1 ตำแหน่ง, ไม่ clamp); `yieldOutputTon` = `prd_a`
- คำนวณสดใน `getRmd7RmWeightTon` (`src/lib/services/rmd7RmUsed.ts`) ผ่าน `getRmSourcePool("RMD7")` — **ไม่** join `tbl_rmd_weight_schedule` และ **ไม่** อ่าน `tbl_prd_rm_weight` สำหรับ RMD7 (RMD8/MSM ยังใช้เดิม)
- UI: ข้อความ «สูตรชั่วคราว» ใกล้ Yield donut ของ RMD7

**หมายเหตุ:** Yield อาจ > 100% ถ้า `prd_a` (SAP/BUDAT) อัปเดตเร็วกว่า RM จากหน้างาน (`rmd_date`) — ไม่ clamp.

### ตารางตรวจ 2026-10-16 (RMD7)

| ค่า API (`GET /api/production/daily-plant-summary?date=2026-10-16`) | ค่าที่คาด (สูตรชั่วคราว) |
|---------------------------------------------------------------------|---------------------------|
| `actualTon` (RMD7) | 366.302 |
| `targetTon` (RMD7) | 352 |
| `rmWeightTon` | 378.046 |
| `yieldOutputTon` | 366.302 |
| `yieldPct` | 96.9 |

ค่าเก่า (นับซ้ำกะ A+B ไม่มี `rmd_period` จาก `tbl_prd_rm_weight`): RM ≈ 791.7 t, Yield ≈ 93.2% — **ไม่ใช้แล้ว** สำหรับ RMD7 บนหน้านี้.

สูตร schedule × line (RM ≈ 401.1 t, Yield ≈ 91.3%) — **แทนที่แล้ว** ด้วยสูตรชั่วคราวด้านบนในรอบ rework 2026-10-17.

### โหลด query / cache

- 1 query ต่อวัน, `SUM(rmd_weight)` aggregate 1 แถว (ไม่มี `TOP` ตัดผลรวม)
- Cache in-memory key `RMD7:{date}`, TTL ≤ 5 นาที, สูงสุด 50 key (ลบคีย์เก่าสุดเมื่อเกิน)
- Timeout DB: connect 8s / request 20s (`rmSources.ts`)

### Index แนะนำ (ให้ DBA/โอ๊ตตัดสิน — ตรวจ `sp_helpindex` ก่อน)

- `tbl_rmd_weight_line`: `(rmd_date)` INCLUDE (`rmd_weight`, `rmd_tis_check`) หรือดัชนีที่รองรับ filter `rmd_date` range + aggregate ตามที่มีอยู่
