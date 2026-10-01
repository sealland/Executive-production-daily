import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getByLine } from "@/lib/services/breakdowns";

export async function GET(request: Request) {
  try {
    const rows = await getByLine(filtersFromRequest(request));
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลด Production by Line ไม่สำเร็จ", 500, error);
  }
}
