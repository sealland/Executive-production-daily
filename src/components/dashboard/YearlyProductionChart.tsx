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
import type { YearlyPoint } from "@/lib/types/production";
import { formatSignedPct, formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

function ActualLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
}) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 8}
      fill="#1f4e79"
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {formatTon(n, 0)}
    </text>
  );
}

function TargetLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
}) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 8}
      fill="#475569"
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {formatTon(n, 0)}
    </text>
  );
}

function YoYLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string | null;
}) {
  const { x = 0, y = 0, value } = props;
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;

  const fill = n >= 0 ? "#0f766e" : "#b91c1c";

  return (
    <text
      x={Number(x)}
      y={Number(y) - 10}
      fill={fill}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {formatSignedPct(n)}
    </text>
  );
}

export function YearlyProductionChart({ points }: { points: YearlyPoint[] }) {
  if (!points.length) return <EmptyState />;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as YearlyPoint;
              return (
                <div className="chart-tooltip">
                  <strong>{label}</strong>
                  <div>Actual: {formatTon(row.actualTon)}</div>
                  <div>Target: {formatTon(row.targetTon)}</div>
                  <div>YoY: {formatSignedPct(row.yoyPct)}</div>
                </div>
              );
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="actualTon" name="Actual" fill="#1f4e79" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="actualTon" content={<ActualLabel />} />
          </Bar>
          <Bar yAxisId="left" dataKey="targetTon" name="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="targetTon" content={<TargetLabel />} />
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="yoyPct"
            name="YoY %"
            stroke="#0f766e"
            strokeWidth={2}
            dot={{ r: 3, fill: "#0f766e" }}
          >
            <LabelList dataKey="yoyPct" content={<YoYLabel />} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
