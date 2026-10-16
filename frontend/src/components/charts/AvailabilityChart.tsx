import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendBucket } from "../../api/types";
import { formatBucketLabel } from "./TrendChart";

const AXIS_LABEL_STYLE = { fontSize: 11, fill: "#3d5463" } as const;

export interface AvailabilityChartProps {
  buckets: TrendBucket[];
  granularity: "hour" | "day";
}

/**
 * Availability per bucket. Buckets without checks render as gaps (null), so an
 * empty period is never drawn as 100% or 0% uptime.
 */
export function AvailabilityChart({ buckets, granularity }: AvailabilityChartProps) {
  const data = buckets.map((bucket) => ({
    label: formatBucketLabel(bucket.bucket_start, granularity),
    availability: bucket.total > 0 ? (bucket.successful / bucket.total) * 100 : null,
    checks: bucket.total,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 76, 117, 0.14)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_LABEL_STYLE} interval="preserveStartEnd" minTickGap={28} />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(value: number) => `${value}%`}
          tick={AXIS_LABEL_STYLE}
          width={44}
        />
        <Tooltip
          formatter={(value, name) =>
            name === "Availability" && typeof value === "number"
              ? [`${value.toFixed(1)}%`, name]
              : [value, name]
          }
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Line
          dataKey="availability"
          name="Availability"
          stroke="#3282b8"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
