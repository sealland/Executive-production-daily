import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getByPlant } from "@/lib/services/breakdowns";

export async function GET(request: Request) {
  try {
    const rows = await getByPlant(filtersFromRequest(request));
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลด Production by Plant ไม่สำเร็จ", 500, error);
  }
}
