import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getSummaryKpis } from "@/lib/services/summary";

export async function GET(request: Request) {
  try {
    const filters = filtersFromRequest(request);
    const kpis = await getSummaryKpis(filters);
    return jsonOk({ kpis });
  } catch (error) {
    return jsonError("โหลด KPI ไม่สำเร็จ", 500, error);
  }
}
