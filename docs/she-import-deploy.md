# SHE Excel import — deploy (v0.6.1)

เป้าหมาย: เปิดอัปโหลด Excel SHE บน production (CEO_REPORT) อย่างปลอดภัย หลังรัน DDL และตั้ง env

**v0.6.0:** อัปโหลดผ่านเว็บใช้ `?currentUser=<รหัสพนักงาน>` จาก URL หน้า Executive Report (ส่งต่อจากเว็บภายใน / iframe) — **ไม่ใช้ PIN / session cookie สำหรับ import อีกต่อไป**. ปุ่มอัปโหลดแสดงเฉพาะเมื่อ `GET /api/she/auth/eligibility` คืน `canUpload: true` (รหัสอยู่ใน allowlist `SHE_UPLOAD_EMPCODES`). ตอน import ระบบตรวจ allowlist + พนักงาน active (`PRI_STATUS=1`) อีกครั้ง

**ความเสี่ยงที่รับ:** ผู้ใช้ที่เข้าแอปตรงบน LAN และใส่ `?currentUser=<รหัสใน allowlist>` อาจอัปโหลดได้แม้ไม่ได้ login ผ่านเว็บภายใน — ลดผลกระทบด้วย allowlist, ตรวจพนักงาน active, access log และ rate limit

**แนะนำ IT:** จำกัดทางเข้าแอปให้ผ่านเว็บภายใน / reverse proxy ที่ควบคุม query `currentUser` ได้ (ไม่พึ่ง LAN อย่างเดียว)

**เลิกจำเป็น (v0.6.0):** `SHE_AUTH_SECRET`, `SHE_UPLOAD_USERS` — route `/api/she/auth` (PIN login) ยังอยู่ในโค้ดแต่ import ไม่เรียกใช้แล้ว; ลบในรอบถัดไปได้ตามดุลยพินิจ

## ลำดับ deploy

1. **DDL** — DBA รัน `sql/she/tbl_she_incident_xls.sql` บนฐาน CEO_REPORT (สร้างตาราง +คอลัมน์ `imported_by` ถ้ายังไม่มี)
2. **สิทธิ์** — GRANT บน `dbo.tbl_she_incident_xls` ให้ login ที่แอปใช้ (แทน placeholder ด้วย login จริงโดย DBA)
   ```sql
   GRANT SELECT, INSERT, DELETE ON dbo.tbl_she_incident_xls TO [<app login>];
   ```
3. **Environment** (ตั้งในเซิร์ฟเวอร์ deploy โดยผู้ดูแลระบบ ห้ามใส่รหัสพนักงานจริงใน repo/docs)
   - `SHE_IMPORT_ENABLED=true` — เปิด import (ค่าเริ่มต้นปิด = 403)
   - `SHE_UPLOAD_EMPCODES` — รหัสพนักงานที่อนุญาตอัปโหลด คั่นด้วย comma (ว่าง = ปฏิเสธทุกคน); เป็นทั้ง allowlist สำหรับ eligibility และ import
   - **Traefik (จำเป็น):** Traefik ต้อง **เขียนทับ/append** header `X-Forwarded-For` ด้วย IP ของ client จริงเสมอ (แอปใช้ entry ขวาสุดสำหรับ rate limit — entry ซ้ายสุดปลอมได้) และตั้ง `X-Forwarded-Proto` กับ `X-Forwarded-Host` ให้ตรงกับ URL ที่ผู้ใช้เปิด (การตรวจ Origin ของ import ขึ้นกับสอง header นี้; ไม่ตรง = 403 ทุกครั้ง). ห้ามให้ client ส่ง header เหล่านี้เข้ามาตรง ๆ โดย Traefik ไม่แก้ค่า
   - Rate limit: 5 ครั้ง/นาที ต่อ IP และต่อรหัสพนักงาน (in-memory, แต่ละ process แยกกัน) — ใช้กับ eligibility และ auth PIN (ถ้ายังเปิดใช้)
4. **Deploy** — build และ deploy แอป v0.6.1 ด้วย `npm ci` (ใช้ package-lock.json จาก repo นี้ — next 16.4.2 / sharp 0.35.5 ตาม lock). **Build/CI ไม่ต้องออก internet ไป cdn.sheetjs.com** — ใช้ `vendor/xlsx-0.20.3.tgz`
   - `tsx` ใช้เฉพาะ `npm test` และ CLI import (`npm run she:import`) ไม่จำเป็นสำหรับ runtime ของ web app

### Access log (optional — Executive Report)

แอปทำงานได้ปกติเมื่อไม่ตั้งค่าเหล่านี้ (`recordAccessLog` จะข้ามเงียบ ๆ). ถ้า infra ต้องการบันทึกการเปิดรายงาน ตั้ง env บนเซิร์ฟเวอร์ deploy (ห้าม commit password):

| Variable | Example / note |
|----------|----------------|
| `SQL_ACCESS_LOG_HOST` | `192.168.201.115` |
| `SQL_ACCESS_LOG_DATABASE` | `PP` (schema `dbo`) |
| `SQL_ACCESS_LOG_TABLE` | `tbl_access_log` |
| `SQL_ACCESS_LOG_USER` | *(infra fills in)* |
| `SQL_ACCESS_LOG_PASSWORD` | *(infra fills in)* |
| `SQL_ACCESS_LOG_PORT` | `1433` (optional) |
| `SQL_ACCESS_LOG_SCHEMA` | `dbo` (optional, default `dbo`) |
| `SQL_ACCESS_LOG_ENCRYPT` | `false` (optional) |
| `SQL_ACCESS_LOG_TRUST_SERVER_CERT` | `true` (optional) |

## Checklist ทดสอบหลัง deploy

- [ ] เปิดรายงานด้วย `?currentUser=<รหัสใน allowlist>` → เห็นปุ่มอัปโหลด (icon) เฉพาะรหัสที่อนุญาต
- [ ] อัปโหลดไฟล์ SHE จริง → นำเข้าสำเร็จ; badge แสดง upload โดยรหัสผู้ upload
- [ ] ไม่มี `currentUser` หรือรหัสนอก allowlist → ไม่เห็นปุ่มอัปโหลด
- [ ] `POST /api/she/import` ไม่มี `currentUser` → 401; รหัสนอก allowlist หรือไม่ active → 403 (ข้อความเดียวกัน)
- [ ] ไฟล์ผิดรูปแบบ / เกิน 10 MB → ปฏิเสธ และข้อมูลเดิมยังอยู่ครบ
- [ ] `/api/production/summary`, `/api/production/downtime` → **200**

## Rollback

ตั้ง `SHE_IMPORT_ENABLED=false` (หรือลบ env) แล้ว restart — UI สรุป SHE จากข้อมูลที่ import ไว้ยังทำงาน; ปุ่มอัปโหลดได้ 403

- Rollback เป็น v0.5.0 ต้องคืน workflow PIN + env `SHE_AUTH_SECRET` / `SHE_UPLOAD_USERS` หากยังใช้ session login
