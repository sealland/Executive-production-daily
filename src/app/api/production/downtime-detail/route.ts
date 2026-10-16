import { jsonError, jsonOk } from "@/lib/api/http";
import { getDowntimeDetail } from "@/lib/services/downtimeDetail";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return jsonError("date is required", 400);

  try {
    const { rows, windowSource, windows } = await getDowntimeDetail(date);
    return jsonOk({ rows, windowSource, windows });
  } catch (error) {
    return jsonError("โหลด Downtime Detail ไม่สำเร็จ", 500, error);
  }
}
