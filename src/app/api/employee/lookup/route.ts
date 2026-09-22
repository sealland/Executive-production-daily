import { jsonError, jsonOk } from "@/lib/api/http";
import { recordAccessLog } from "@/lib/services/accessLog";
import { lookupEmployee } from "@/lib/services/employee";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return jsonError("code is required", 400);

  try {
    const employee = await lookupEmployee(code);
    if (employee?.username) {
      try {
        await recordAccessLog({ prsNo: employee.code, username: employee.username });
      } catch (error) {
        console.error("[access-log] failed to record visit", error);
      }
    }

    return jsonOk({
      employee: employee
        ? { code: employee.code, name: employee.name, position: employee.position }
        : null
    });
  } catch (error) {
    return jsonError("ค้นหาพนักงานไม่สำเร็จ", 500, error);
  }
}
