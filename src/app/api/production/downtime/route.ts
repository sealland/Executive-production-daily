import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getDowntimeSummary } from "@/lib/services/downtime";

export async function GET(request: Request) {
  try {
    const data = await getDowntimeSummary(filtersFromRequest(request));
    return jsonOk(data);
  } catch (error) {
    return jsonError("โหลด Downtime ไม่สำเร็จ", 500, error);
  }
}
