import { jsonError, jsonOk } from "@/lib/api/http";
import { getHighlightHistory } from "@/lib/services/highlight";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const plant = searchParams.get("plant");
  if (!date || !plant) return jsonError("date and plant are required", 400);

  try {
    const rows = await getHighlightHistory(date, plant);
    return jsonOk({ rows });
  } catch (error) {
    return jsonError("โหลดประวัติ Highlight ไม่สำเร็จ", 500, error);
  }
}
