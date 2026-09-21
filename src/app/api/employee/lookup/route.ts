import { jsonError, jsonOk } from "@/lib/api/http";
import { lookupEmployee } from "@/lib/services/employee";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return jsonError("code is required", 400);

  try {
    const employee = await lookupEmployee(code);
    return jsonOk({ employee });
  } catch (error) {
    return jsonError("ค้นหาพนักงานไม่สำเร็จ", 500, error);
  }
}
