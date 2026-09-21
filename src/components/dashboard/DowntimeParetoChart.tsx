"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DowntimeSummary } from "@/lib/types/production";
import { formatMinutes, formatPct } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";
import { useMemo, useState } from "react";

export function DowntimeParetoChart({ data }: { data: DowntimeSummary | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const reasons = useMemo(() => {
    if (!data) return [];
    if (!selected) return data.reasons.slice(0, 8);
    return data.reasons.filter((r) => r.category === selected).slice(0, 8);
  }, [data, selected]);

  if (!data || !data.groups.length) {
    return (
      <div>
        <EmptyState label="ไม่พบข้อมูล Downtime" />
        {data?.scopeNote ? <p className="panel-note">{data.scopeNote}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="downtime-summary">
        <span>
          {data.asOfDate ? `ณ ${data.asOfDate}` : "Today"}: {formatMinutes(data.todayMinutes)}
        </span>
        <span>
          vs วันก่อน: {data.diffMinutes > 0 ? "+" : ""}
          {Math.round(data.diffMinutes)} min
        </span>
      </div>
      {data.scopeNote ? <p className="panel-note">{data.scopeNote}</p> : null}
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.groups}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as DowntimeSummary["groups"][number];
                return (
                  <div className="chart-tooltip">
                    <strong>{row.category}</strong>
                    <div>{formatMinutes(row.minutes)}</div>
                    <div>Contribution {formatPct(row.contributionPct)}</div>
                    <div>Cumulative {formatPct(row.cumulativePct)}</div>
                  </div>
                );
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="minutes"
              fill="#9a3412"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(item) => {
                const row = item as unknown as { category?: string };
                if (row.category) setSelected(row.category);
              }}
            />
            <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#1f4e79" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="reason-list">
        <div className="reason-head">
          <strong>Reasons {selected ? `· ${selected}` : ""}</strong>
          {selected ? (
            <button type="button" className="btn ghost" onClick={() => setSelected(null)}>
              ล้างการเลือก
            </button>
          ) : null}
        </div>
        {reasons.map((r) => (
          <div key={`${r.category}-${r.problem}`} className="reason-item">
            <div>
              <strong>{r.problem}</strong>
              <span>{r.category}</span>
            </div>
            <span>{formatMinutes(r.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
