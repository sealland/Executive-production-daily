# SHE Excel import — deploy (v0.5.0)

เป้าหมาย: เปิดอัปโหลด Excel SHE บน production (CEO_REPORT) อย่างปลอดภัย หลังรัน DDL และตั้ง env

**v0.5.0:** อัปโหลดผ่านเว็บต้องยืนยันตัวตน (รหัสพนักงาน + PIN ต่อคน) และได้ session cookie 8 ชม. — ไม่ใช้ header `X-Emp-Code` อีกต่อไป. การจำกัดเฉพาะ LAN ที่ Traefik เป็นมาตรการชั่วคราวของ IT **ไม่ใช่**ตัวแทนการยืนยันตัวตนนี้

## ลำดับ deploy

1. **DDL** — DBA รัน `sql/she/tbl_she_incident_xls.sql` บนฐาน CEO_REPORT (สร้างตาราง +คอลัมน์ `imported_by` ถ้ายังไม่มี)
2. **สิทธิ์** — GRANT บน `dbo.tbl_she_incident_xls` ให้ login ที่แอปใช้ (แทน placeholder ด้วย login จริงโดย DBA)
   ```sql
   GRANT SELECT, INSERT, DELETE ON dbo.tbl_she_incident_xls TO [<app login>];
   ```
3. **Environment** (ตั้งในเซิร์ฟเวอร์ deploy โดยผู้ดูแลระบบ ห้ามใส่รหัสพนักงาน/PIN/secret จริงใน repo/docs)
   - `SHE_IMPORT_ENABLED=true` — เปิด import (ค่าเริ่มต้นปิด = 403)
   - `SHE_UPLOAD_EMPCODES` — รหัสพนักงานที่อนุญาตอัปโหลด คั่นด้วย comma (ว่าง = ปฏิเสธทุกคน)
   - `SHE_AUTH_SECRET` — สตริงลับอย่างน้อย 32 ตัวอักษร สำหรับลงนาม session cookie (ว่างหรือสั้น = ปฏิเสธทุกคน). สร้างตัวอย่าง: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - `SHE_UPLOAD_USERS` — รายการ `รหัสพนักงาน:hash` คั่นด้วย comma; hash = scrypt ของ PIN (รูปแบบ `saltBase64url.hashBase64url` ตามที่แอปใช้). สร้าง hash ตัวอย่าง (ใส่ PIN ของคุณแทน `YOUR_PIN`):
     ```bash
     node -e "const c=require('crypto');const pin='YOUR_PIN';const s=c.randomBytes(16);const h=c.scryptSync(pin,s,32);console.log(s.toString('base64url')+'.'+h.toString('base64url'))"
     ```
   - `SHE_COOKIE_SECURE` — `true`/`false` (ว่าง = `true` เมื่อ `NODE_ENV=production`). ต้องเข้าแอปผ่าน **HTTPS** เมื่อเป็น `true`; ถ้า Traefik เป็น HTTP บน LAN ให้ infra ตั้ง `false` และบันทึกเป็นความเสี่ยง
   - **Traefik (จำเป็น):** Traefik ต้อง **เขียนทับ/append** header `X-Forwarded-For` ด้วย IP ของ client จริงเสมอ (แอปใช้ entry ขวาสุดสำหรับ rate limit — entry ซ้ายสุดปลอมได้) และตั้ง `X-Forwarded-Proto` กับ `X-Forwarded-Host` ให้ตรงกับ URL ที่ผู้ใช้เปิด (การตรวจ Origin ของ import/auth ขึ้นกับสอง header นี้; ไม่ตรง = 403 ทุกครั้ง). ห้ามให้ client ส่ง header เหล่านี้เข้ามาตรง ๆ โดย Traefik ไม่แก้ค่า
   - Rate limit: 5 ครั้ง/นาที ต่อ IP และต่อรหัสพนักงาน (in-memory, แต่ละ process แยกกัน)
   - Logout: `DELETE /api/she/auth` ลบ cookie (ปุ่ม "ออกจากระบบ" ในหน้า Executive Report)
4. **Deploy** — build และ deploy แอป v0.5.0 ด้วย `npm ci` (ใช้ package-lock.json จาก repo นี้ — next 16.4.2 / sharp 0.35.5 ตาม lock; SHA256 ของ package-lock.json = `346ea874dce9e71f54bf37779cffee32955f0bc4fad4936199d492717d68e5fc` ถ้าไม่ตรงให้หยุดและแจ้งโอ๊ต). **Build/CI ไม่ต้องออก internet ไป cdn.sheetjs.com** — ใช้ `vendor/xlsx-0.20.3.tgz` (SHA256 ของ tgz = `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`)
   - `tsx` ใช้เฉพาะ `npm test` และ CLI import (`npm run she:import`) ไม่จำเป็นสำหรับ runtime ของ web app
5. **Prerequisite ก่อน deploy ครั้งแรก** — package-lock.json มี tsx/esbuild และ vendor xlsx อยู่แล้ว. ก่อน deploy ให้ commit package-lock.json ตัวปัจจุบัน แล้วตรวจ SHA256 ตาม step 4

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

- [ ] ยืนยันตัวตน (รหัส + PIN) แล้วอัปโหลดไฟล์ SHE จริง → นำเข้า **63** แถว; ตัดออก 4 (LI)
- [ ] สรุป YTD: **PD 40**, First Aid **9**, **TRI 8**, Near Miss **4**, **LTI 2**
- [ ] Days w/o LTI สมเหตุสมผล (~**203** วัน ตาม as-of รายงาน)
- [ ] Badge แสดง source / ถึงวันที่ / เวลา import / upload โดยรหัสผู้ upload
- [ ] **Print** — ไม่แสดงรายละเอียดเหตุการณ์จาก Excel (เฉพาะสรุป)
- [ ] ผู้ใช้ที่ PIN/allowlist ไม่ถูกต้อง → 401/403 (ข้อความเดียวกันสำหรับรหัสผิด — ไม่เผย allowlist)
- [ ] ไฟล์ผิดรูปแบบ / ไฟล์ผิด / sheet DATA ว่าง (0 แถว) / เกิน 500 แถว / เกิน 10 MB → ปฏิเสธ และข้อมูลเดิมยังอยู่ครบ (ไม่ถูกลบ)
- [ ] `/api/production/summary`, `/api/production/downtime`, `/api/production/downtime-detail?date=YYYY-MM-DD` → **200** (Downtime DB SQL 2012 / compat 110)

## Rollback

ตั้ง `SHE_IMPORT_ENABLED=false` (หรือลบ env) แล้ว restart — UI สรุป SHE จากข้อมูลที่ import ไว้ยังทำงาน; ปุ่มอัปโหลดได้ 403

- การ rollback เป็น v0.4.3 (หรือปิด switch) **ไม่ลบ** ข้อมูลที่ import ไว้แล้ว ตารางยังอยู่และยังถูกอ่านโดย summary
- Rollback เป็น v0.4.3: client เก่าที่ส่ง `X-Emp-Code` จะไม่ทำงานกับ v0.5.0 (คาดหวัง) — ต้อง deploy คู่กับ env `SHE_AUTH_SECRET` / `SHE_UPLOAD_USERS` หรือ rollback ทั้งแอปและ env
