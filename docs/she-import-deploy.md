# SHE Excel import — deploy (v0.4.3)

เป้าหมาย: เปิดอัปโหลด Excel SHE บน production (CEO_REPORT) อย่างปลอดภัย หลังรัน DDL และตั้ง env

## ลำดับ deploy

1. **DDL** — DBA รัน `sql/she/tbl_she_incident_xls.sql` บนฐาน CEO_REPORT (สร้างตาราง +คอลัมน์ `imported_by` ถ้ายังไม่มี)
2. **สิทธิ์** — GRANT บน `dbo.tbl_she_incident_xls` ให้ login ที่แอปใช้ (แทน placeholder ด้วย login จริงโดย DBA)
   ```sql
   GRANT SELECT, INSERT, DELETE ON dbo.tbl_she_incident_xls TO [<app login>];
   ```
3. **Environment** (ตั้งในเซิร์ฟเวอร์ deploy โดยผู้ดูแลระบบ ห้ามใส่รหัสพนักงานใน repo/docs)
   - `SHE_IMPORT_ENABLED=true` — เปิด import (ค่าเริ่มต้นปิด = 403)
   - `SHE_UPLOAD_EMPCODES` — รหัสพนักงานที่อนุญาตอัปโหลด คั่นด้วย comma (ว่าง = ปฏิเสธทุกคน)
4. **Deploy** — build และ deploy แอป v0.4.3 ด้วย `npm ci` (ใช้ package-lock.json จาก repo นี้ — next 16.4.2 / sharp 0.35.5 ตาม lock; SHA256 ของ package-lock.json = `9331d1c5e58dee14659d6a4c8afe475de5fe00e1072b5b0218e83a9f583f6f11` ถ้าไม่ตรงให้หยุดและแจ้งโอ๊ต)
   - `tsx` ใช้เฉพาะ `npm test` และ CLI import (`npm run she:import`) ไม่จำเป็นสำหรับ runtime ของ web app
5. **Prerequisite ก่อน deploy ครั้งแรก** — ไม่ต้องรัน `npm install` — package-lock.json มี tsx/esbuild อยู่แล้ว. ก่อน deploy ให้ commit package-lock.json ตัวปัจจุบัน (รวม next 16.4.2, sharp 0.35.5, @next/*, @img/*, tailwind oxide wasm helpers 6 ตัว) แล้วตรวจ SHA256 ตาม step 4

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

- [ ] อัปโหลดไฟล์ SHE จริง → นำเข้า **63** แถว; ตัดออก 4 (LI)
- [ ] สรุป YTD: **PD 40**, First Aid **9**, **TRI 8**, Near Miss **4**, **LTI 2**
- [ ] Days w/o LTI สมเหตุสมผล (~**203** วัน ตาม as-of รายงาน)
- [ ] Badge แสดง source / ถึงวันที่ / เวลา import / upload โดยรหัสผู้ upload
- [ ] **Print** — ไม่แสดงรายละเอียดเหตุการณ์จาก Excel (เฉพาะสรุป)
- [ ] ผู้ใช้ที่**ไม่**อยู่ใน `SHE_UPLOAD_EMPCODES` → 403
- [ ] ไฟล์ผิดรูปแบบ / ไฟล์ผิด / sheet DATA ว่าง (0 แถว) → ปฏิเสธ และข้อมูลเดิมยังอยู่ครบ (ไม่ถูกลบ)
- [ ] `/api/production/summary`, `/api/production/downtime`, `/api/production/downtime-detail?date=YYYY-MM-DD` → **200** (Downtime DB SQL 2012 / compat 110)

## Rollback

ตั้ง `SHE_IMPORT_ENABLED=false` (หรือลบ env) แล้ว restart — UI สรุป SHE จากข้อมูลที่ import ไว้ยังทำงาน; ปุ่มอัปโหลดได้ 403
- การ rollback (ปิด switch) **ไม่ลบ** ข้อมูลที่ import ไว้แล้ว ตารางยังอยู่และยังถูกอ่านโดย summary
