"use client";

import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  TriangleAlert
} from "lucide-react";
import type { KpiMetric } from "@/lib/types/production";
import {
  formatMinutes,
  formatPct,
  formatSignedPct,
  formatTon,
  statusClass,
  statusLabel
} from "@/lib/format/numbers";

function StatusIcon({ status }: { status?: KpiMetric["status"] }) {
  if (status === "green") return <CheckCircle2 size={16} />;
  if (status === "yellow") return <TriangleAlert size={16} />;
  if (status === "red") return <CircleAlert size={16} />;
  return <CircleHelp size={16} />;
}

function primaryText(metric: KpiMetric) {
  if (metric.placeholder) return "—";
  if (metric.unit === "%") {
    return metric.key === "yoy" ? formatSignedPct(metric.value) : formatPct(metric.value);
  }
  if (metric.unit === "min") return formatMinutes(metric.value);
  return formatTon(metric.value);
}

export function KpiCard({ metric }: { metric: KpiMetric }) {
  return (
    <article className={`kpi-card ${statusClass(metric.status || "neutral")}`}>
      <div className="kpi-top">
        <span>{metric.label}</span>
        {metric.status ? (
          <span className="kpi-status">
            <StatusIcon status={metric.status} />
            {statusLabel(metric.status)}
          </span>
        ) : null}
      </div>
      <div className="kpi-value">{primaryText(metric)}</div>
      {metric.achievementPct !== undefined && metric.key !== "yoy" ? (
        <div className="kpi-sub">Achievement {formatPct(metric.achievementPct)}</div>
      ) : null}
      {metric.secondaryLabel && metric.secondaryValue !== undefined ? (
        <div className="kpi-sub">
          {metric.secondaryLabel}:{" "}
          {metric.secondaryUnit === "%"
            ? formatPct(metric.secondaryValue)
            : formatTon(metric.secondaryValue)}
        </div>
      ) : null}
      {metric.delta !== undefined && metric.delta !== null ? (
        <div className="kpi-sub">
          {metric.deltaLabel}:{" "}
          {metric.unit === "min"
            ? `${metric.delta > 0 ? "+" : ""}${Math.round(metric.delta)} min`
            : formatSignedPct(metric.delta)}
        </div>
      ) : null}
      {metric.note ? <div className="kpi-note">{metric.note}</div> : null}
      {metric.placeholder ? <div className="kpi-note">Placeholder</div> : null}
    </article>
  );
}
