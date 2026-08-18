"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MonthlyPoint } from "@/lib/types/production";
import { formatPct, formatSignedPct, formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

function YoYLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
}) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;

  const cx = Number(x) + Number(width) / 2;
  const cy = Number(y) - 8;
  const fill = n >= 0 ? "#0f766e" : "#b91c1c";

  return (
    <text
      x={cx}
      y={cy}
      fill={fill}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {formatSignedPct(n)}
    </text>
  );
}

function TargetLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string | null;
}) {
  const { x = 0, y = 0, value } = props;
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  return (
    <text
      x={Number(x)}
      y={Number(y) - 10}
      fill="#15803d"
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
    >
      {formatTon(n, 0)}
    </text>
  );
}

export function MonthlyProductionChart({ points }: { points: MonthlyPoint[] }) {
  if (!points.length) return <EmptyState />;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as MonthlyPoint;
              return (
                <div className="chart-tooltip">
                  <strong>{label}</strong>
                  <div>Actual: {formatTon(row.actualTon)}</div>
                  <div>Target: {formatTon(row.targetTon)}</div>
                  <div>Achievement: {formatPct(row.achievementPct)}</div>
                  <div>Previous Year: {formatTon(row.previousYearTon)}</div>
                  <div>YoY: {formatSignedPct(row.yoyPct)}</div>
                </div>
              );
            }}
          />
          <Legend />
          <Bar dataKey="actualTon" name="Actual ปีนี้" fill="#1f4e79" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="yoyPct" content={<YoYLabel />} />
          </Bar>
          <Line
            type="monotone"
            dataKey="targetTon"
            name="Target ปีนี้"
            stroke="#15803d"
            strokeWidth={2}
            dot={{ r: 3, fill: "#15803d" }}
          >
            <LabelList dataKey="targetTon" content={<TargetLabel />} />
          </Line>
          <Line type="monotone" dataKey="previousYearTon" name="Actual ปีก่อน" stroke="#94a3b8" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
