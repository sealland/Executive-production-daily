import { getAccessLogPool, getAccessLogTable, isAccessLogConfigured, sql } from "@/lib/db/accessLog";

export const EXECUTIVE_REPORT_NAME = "Executive-Report";

export async function recordAccessLog(input: {
  prsNo: string;
  username: string;
}): Promise<void> {
  if (!isAccessLogConfigured()) return;

  const pool = await getAccessLogPool();
  const table = getAccessLogTable();
  await pool
    .request()
    .input("prsNo", sql.NVarChar(50), input.prsNo)
    .input("username", sql.NVarChar(100), input.username)
    .input("reportName", sql.NVarChar(100), EXECUTIVE_REPORT_NAME)
    .query(`
      INSERT INTO ${table} (PRS_NO, username, access_time, report_name)
      VALUES (@prsNo, @username, SYSDATETIME(), @reportName)
    `);
}
