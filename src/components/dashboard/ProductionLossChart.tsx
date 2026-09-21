"use client";

import type { LossRow } from "@/lib/types/production";
import { formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

export function ProductionLossChart({ rows }: { rows: LossRow[] }) {
  if (!rows.length) return <EmptyState />;
  const available = rows.filter((r) => r.available && r.ton !== null);
  if (!available.length) {
    return (
      <EmptyState label="ยังไม่มีข้อมูล Loss เป็นตัน — เตรียมโครงสร้างไว้แล้ว รออัตราผลิต/สูตร Loss" />
    );
  }

  return (
    <div className="loss-grid">
      {rows.map((row) => (
        <div key={row.type} className="loss-card">
          <span>{row.type}</span>
          <strong>{row.available ? formatTon(row.ton) : "—"}</strong>
          {row.note ? <small>{row.note}</small> : null}
        </div>
      ))}
    </div>
  );
}
