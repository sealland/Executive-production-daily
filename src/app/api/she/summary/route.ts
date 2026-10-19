import { jsonError, jsonOk } from "@/lib/api/http";
import { getSheSummary } from "@/lib/services/sheSummary";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("date is required (YYYY-MM-DD)", 400);
  }

  try {
    const summary = await getSheSummary(date);
    return jsonOk({ summary });
  } catch (error) {
    return jsonError("โหลด SHE summary ไม่สำเร็จ", 500, error);
  }
}
