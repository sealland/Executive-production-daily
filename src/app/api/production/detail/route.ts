import { filtersFromRequest, jsonError, jsonOk } from "@/lib/api/http";
import { getDetail } from "@/lib/services/detail";

export async function GET(request: Request) {
  try {
    const data = await getDetail(filtersFromRequest(request));
    return jsonOk(data);
  } catch (error) {
    return jsonError("โหลด Detail ไม่สำเร็จ", 500, error);
  }
}
