import { jsonError, jsonOk } from "@/lib/api/http";
import { getLongDowntimeEvents, type LongDowntimeEvent } from "@/lib/services/downtimeDetail";
import { getHighlight, InvalidEmployeeError, saveHighlight } from "@/lib/services/highlight";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const plant = searchParams.get("plant");
  if (!date || !plant) return jsonError("date and plant are required", 400);

  try {
    const record = await getHighlight(date, plant);
    // No saved highlight yet -> suggest downtime events > 120 min as the default text.
    let downtimeDefault: LongDowntimeEvent[] = [];
    if (!record || !record.text.trim()) {
      downtimeDefault = await getLongDowntimeEvents(date, plant).catch(() => []);
    }
    return jsonOk({ record, downtimeDefault });
  } catch (error) {
    return jsonError("โหลด Highlight ไม่สำเร็จ", 500, error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { date, plant, text, occurredTime, empCode } = body as {
      date?: string;
      plant?: string;
      text?: string;
      occurredTime?: string | null;
      empCode?: string;
    };
    if (!date || !plant || typeof text !== "string" || !empCode) {
      return jsonError("date, plant, text and empCode are required", 400);
    }
    if (occurredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurredTime)) {
      return jsonError("occurredTime must be HH:MM", 400);
    }
    const record = await saveHighlight(date, plant, text, occurredTime || null, empCode);
    return jsonOk({ record });
  } catch (error) {
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    return jsonError("บันทึก Highlight ไม่สำเร็จ", 500, error);
  }
}
