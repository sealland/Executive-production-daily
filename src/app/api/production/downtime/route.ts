import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getDowntimeSummary } from "@/lib/services/downtime";
import { WindowLimitError } from "@/lib/services/planWindow";

export async function GET(request: Request) {
  try {
    const data = await getDowntimeSummary(filtersFromRequest(request));
    return jsonOk(data);
  } catch (error) {
    if (error instanceof WindowLimitError) {
      return jsonError(error.message, 400, error);
    }
    return jsonError("โหลด Downtime ไม่สำเร็จ", 500, error);
  }
}
