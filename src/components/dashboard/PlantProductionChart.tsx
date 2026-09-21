"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { PlantRow } from "@/lib/types/production";
import { formatPct, formatTon } from "@/lib/format/numbers";
import { EmptyState } from "@/components/dashboard/PanelStates";

function AchievementLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
  payload?: PlantRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value, payload } = props;
  const raw = value ?? payload?.achievementPct;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;

  const bx = Number(x);
  const by = Number(y);
  const bw = Number(width);
  const bh = Number(height);
  const cy = by + bh / 2 + 4;
  // Longest bars (often MMT) clip outside labels — render inside the bar instead.
  const inside = bw >= 56;
  const cx = inside ? bx + bw - 6 : bx + bw + 6;
  const fill = inside ? "#ffffff" : n >= 100 ? "#15803d" : n >= 95 ? "#a16207" : "#b91c1c";

  return (
    <text
      x={cx}
      y={cy}
      fill={fill}
      textAnchor={inside ? "end" : "start"}
      fontSize={11}
      fontWeight={600}
    >
      {formatPct(n)}
    </text>
  );
}

export function PlantProductionChart({
  rows,
  onSelect
}: {
  rows: PlantRow[];
  onSelect?: (plant: string) => void;
}) {
  if (!rows.length) return <EmptyState />;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} layout="vertical" margin={{ left: 24, right: 56, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="plant" width={70} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as PlantRow;
              return (
                <div className="chart-tooltip">
                  <strong>{row.plant}</strong>
                  <div>{formatTon(row.actualTon)}</div>
                  <div>Achievement {formatPct(row.achievementPct)}</div>
                  <div>Share {formatPct(row.sharePct)}</div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="actualTon"
            fill="#1f4e79"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(data) => {
              const row = data as unknown as PlantRow;
              if (row?.plant) onSelect?.(row.plant);
            }}
          >
            <LabelList dataKey="achievementPct" content={AchievementLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
