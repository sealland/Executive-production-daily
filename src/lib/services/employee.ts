import { getCeoPool, sql } from "@/lib/db/ceo";
import type { EmployeeInfo } from "@/lib/types/production";

export class InvalidEmployeeError extends Error {
  constructor(empCode: string) {
    super(`Employee code "${empCode}" not found or not active`);
    this.name = "InvalidEmployeeError";
  }
}

export async function lookupEmployee(empCode: string): Promise<EmployeeInfo | null> {
  const pool = await getCeoPool();
  const result = await pool
    .request()
    .input("code", sql.NVarChar, empCode.trim())
    .query(`
      SELECT TOP 1
        LTRIM(RTRIM(CAST(emp_code AS NVARCHAR(50)))) AS code,
        LTRIM(RTRIM(ISNULL(thai_name, emp_name))) AS name,
        LTRIM(RTRIM(position)) AS position
      FROM INFO.dbo.ZHR_EMPLOYEE
      WHERE LTRIM(RTRIM(CAST(emp_code AS NVARCHAR(50)))) = @code
        AND PRI_STATUS = 1
    `);
  const row = result.recordset[0] as { code: string; name: string; position: string | null } | undefined;
  if (!row) return null;
  return { code: row.code, name: row.name, position: row.position || null };
}

export async function requireEmployee(empCode: string): Promise<EmployeeInfo> {
  const employee = await lookupEmployee(empCode);
  if (!employee) throw new InvalidEmployeeError(empCode);
  return employee;
}
