import { jsonError, jsonOk } from "@/lib/api/http";
import { getHighlight, InvalidEmployeeError, saveHighlight } from "@/lib/services/highlight";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const plant = searchParams.get("plant");
  if (!date || !plant) return jsonError("date and plant are required", 400);

  try {
    const record = await getHighlight(date, plant);
    return jsonOk({ record });
  } catch (error) {
    return jsonError("โหลด Highlight ไม่สำเร็จ", 500, error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { date, plant, text, empCode } = body as {
      date?: string;
      plant?: string;
      text?: string;
      empCode?: string;
    };
    if (!date || !plant || typeof text !== "string" || !empCode) {
      return jsonError("date, plant, text and empCode are required", 400);
    }
    const record = await saveHighlight(date, plant, text, empCode);
    return jsonOk({ record });
  } catch (error) {
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    return jsonError("บันทึก Highlight ไม่สำเร็จ", 500, error);
  }
}
