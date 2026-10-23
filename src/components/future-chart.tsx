"use client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { Forecast } from "@/lib/finance";
import { formatMoney } from "@/lib/finance";
export default function FutureChart({
  base,
  alternative,
}: {
  base: Forecast;
  alternative: Forecast;
}) {
  const points = alternative.points.map((p, i) => ({
    month: `M${p.month}`,
    current: base.points[i]?.cumulativeSurplus,
    alternative: p.cumulativeSurplus,
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="Cumulative cash remaining after planned savings, baseline compared with scenario"
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 15, right: 14, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e8eae8" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            tickFormatter={(v) => `${Number(v) / 100000}k`}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={45}
          />
          <Tooltip formatter={(v) => formatMoney(Number(v))} />
          <ReferenceLine y={0} stroke="#aaa" />
          <Line
            name="Current plan"
            dataKey="current"
            stroke="#a4aaa7"
            strokeDasharray="4 4"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            name="Your scenario"
            dataKey="alternative"
            stroke="#24694f"
            dot={false}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
