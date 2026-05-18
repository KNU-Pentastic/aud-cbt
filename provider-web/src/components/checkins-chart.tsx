"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts"
import type { Checkin } from "@/mocks/fixtures"

export function CheckinsChart({ data }: { data: Checkin[] }) {
  // 오래된 → 최신 순으로 정렬
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={sorted}
          margin={{ top: 10, right: 16, bottom: 0, left: -16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0 0)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => v.slice(5)}
            stroke="oklch(0.5 0 0)"
            fontSize={11}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            stroke="oklch(0.5 0 0)"
            fontSize={11}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(1 0 0)",
              border: "1px solid oklch(0.9 0 0)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => `${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="mood_nrs"
            name="기분 NRS"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
          <Line
            type="monotone"
            dataKey="craving_nrs"
            name="갈망 NRS"
            stroke="var(--color-chart-4)"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
          <Line
            type="monotone"
            dataKey="sleep_hours"
            name="수면 (시간)"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
