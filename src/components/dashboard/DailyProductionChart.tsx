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
  YAxis,
  Cell
} from "recharts";
import type { DailyPoint } from "@/lib/types/production";
import { formatPct, formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

function AchievementLabel(props: {
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
  const cy = Number(y) - 6;
  const fill = n >= 100 ? "#15803d" : n >= 95 ? "#a16207" : "#b91c1c";

  return (
    <text x={cx} y={cy} fill={fill} textAnchor="middle" fontSize={10} fontWeight={600}>
      {formatPct(n, 0)}
    </text>
  );
}

export function DailyProductionChart({ points }: { points: DailyPoint[] }) {
  if (!points.length) return <EmptyState />;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              if (String(name).includes("%")) return formatPct(n);
              return formatTon(n);
            }}
            labelFormatter={(label) => `วันที่ ${label}`}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as DailyPoint;
              return (
                <div className="chart-tooltip">
                  <strong>{label}</strong>
                  <div>Actual: {formatTon(row.actualTon)}</div>
                  <div>Target: {formatTon(row.targetTon)}</div>
                  <div>Achievement: {formatPct(row.achievementPct)}</div>
                  <div>Difference: {formatTon(row.differenceTon)}</div>
                </div>
              );
            }}
          />
          <Legend />
          <Bar dataKey="actualTon" name="Actual" radius={[4, 4, 0, 0]}>
            {points.map((p) => (
              <Cell key={p.date} fill={p.belowTarget ? "#c45c5c" : "#1f4e79"} />
            ))}
            <LabelList dataKey="achievementPct" content={<AchievementLabel />} />
          </Bar>
          <Line type="monotone" dataKey="targetTon" name="Target" stroke="#64748b" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="ma7Ton" name="7-Day MA" stroke="#0f766e" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
