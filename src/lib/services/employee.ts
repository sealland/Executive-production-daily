import { getCeoPool, sql } from "@/lib/db/ceo";
import { usernameFromEngName } from "@/lib/format/username";
import type { EmployeeInfo } from "@/lib/types/production";

export class InvalidEmployeeError extends Error {
  constructor(empCode: string) {
    super(`Employee code "${empCode}" not found or not active`);
    this.name = "InvalidEmployeeError";
  }
}

function infoDatabaseName() {
  const raw = (process.env.SQL_SERVER_INFO_DATABASE || "INFO").trim();
  if (!/^[A-Za-z0-9_]+$/.test(raw)) {
    throw new Error("SQL_SERVER_INFO_DATABASE contains invalid characters");
  }
  return raw;
}

export type EmployeeLookupResult = EmployeeInfo & {
  username: string | null;
};

export async function lookupEmployee(empCode: string): Promise<EmployeeLookupResult | null> {
  const pool = await getCeoPool();
  const infoDb = infoDatabaseName();
  const result = await pool
    .request()
    .input("code", sql.NVarChar, empCode.trim())
    .query(`
      SELECT TOP 1
        LTRIM(RTRIM(CAST(emp_code AS NVARCHAR(50)))) AS code,
        LTRIM(RTRIM(ISNULL(thai_name, emp_name))) AS name,
        LTRIM(RTRIM(position)) AS position,
        LTRIM(RTRIM(eng_name)) AS engName
      FROM [${infoDb}].dbo.ZHR_EMPLOYEE
      WHERE LTRIM(RTRIM(CAST(emp_code AS NVARCHAR(50)))) = @code
        AND PRI_STATUS = 1
    `);
  const row = result.recordset[0] as
    | { code: string; name: string; position: string | null; engName: string | null }
    | undefined;
  if (!row) return null;

  const username =
    usernameFromEngName(row.engName) || usernameFromEngName(row.name);

  return {
    code: row.code,
    name: row.name,
    position: row.position || null,
    username
  };
}

export async function requireEmployee(empCode: string): Promise<EmployeeInfo> {
  const employee = await lookupEmployee(empCode);
  if (!employee) throw new InvalidEmployeeError(empCode);
  return { code: employee.code, name: employee.name, position: employee.position };
}
