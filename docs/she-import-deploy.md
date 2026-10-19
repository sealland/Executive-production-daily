# SHE Excel import — deploy (v0.4.2)

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
4. **Deploy** — build และ deploy แอป v0.4.2 ด้วย `npm ci` (ใช้ package-lock.json)
   - `tsx` ใช้เฉพาะ `npm test` และ CLI import (`npm run she:import`) ไม่จำเป็นสำหรับ runtime ของ web app
5. **Prerequisite ก่อน deploy ครั้งแรก** — โอ๊ตรัน `npm install` หนึ่งครั้งบนเครื่องที่มี network เพื่อให้ package-lock.json มี `tsx`, แล้ว commit package-lock.json และตรวจว่า diff ของ lock มีเฉพาะ `tsx` และ `esbuild` (dependency ของ tsx) เท่านั้น

## Checklist ทดสอบหลัง deploy

- [ ] อัปโหลดไฟล์ SHE จริง → นำเข้า **63** แถว; ตัดออก 4 (LI)
- [ ] สรุป YTD: **PD 40**, First Aid **9**, **TRI 8**, Near Miss **4**, **LTI 2**
- [ ] Days w/o LTI สมเหตุสมผล (~**203** วัน ตาม as-of รายงาน)
- [ ] Badge แสดง source / ถึงวันที่ / เวลา import / upload โดยรหัสผู้ upload
- [ ] **Print** — ไม่แสดงรายละเอียดเหตุการณ์จาก Excel (เฉพาะสรุป)
- [ ] ผู้ใช้ที่**ไม่**อยู่ใน `SHE_UPLOAD_EMPCODES` → 403
- [ ] ไฟล์ผิดรูปแบบ / ไฟล์ผิด / sheet DATA ว่าง (0 แถว) → ปฏิเสธ และข้อมูลเดิมยังอยู่ครบ (ไม่ถูกลบ)

## Rollback

ตั้ง `SHE_IMPORT_ENABLED=false` (หรือลบ env) แล้ว restart — UI สรุป SHE จากข้อมูลที่ import ไว้ยังทำงาน; ปุ่มอัปโหลดได้ 403
- การ rollback (ปิด switch) **ไม่ลบ** ข้อมูลที่ import ไว้แล้ว ตารางยังอยู่และยังถูกอ่านโดย summary
