import { jsonError, jsonOk } from "@/lib/api/http";
import { InvalidEmployeeError } from "@/lib/services/employee";
import { updateIncident } from "@/lib/services/she";
import type { IncidentStatus } from "@/lib/types/she";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return jsonError("Invalid incident id", 400);

  try {
    const body = await request.json();
    const { title, description, location, occurredTime, status, empCode } = body as {
      title?: string;
      description?: string | null;
      location?: string | null;
      occurredTime?: string | null;
      status?: IncidentStatus;
      empCode?: string;
    };
    if (!title || !status || !empCode) {
      return jsonError("title, status and empCode are required", 400);
    }
    const incident = await updateIncident(
      id,
      {
        title,
        description: description || null,
        location: location || null,
        occurredTime: occurredTime || null,
        status: status === "resolved" ? "resolved" : "monitoring"
      },
      empCode
    );
    return jsonOk({ incident });
  } catch (error) {
    if (error instanceof InvalidEmployeeError) {
      return jsonError("ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่ได้อยู่ในสถานะทำงาน", 403, error);
    }
    return jsonError("แก้ไขรายการ SHE ไม่สำเร็จ", 500, error);
  }
}
