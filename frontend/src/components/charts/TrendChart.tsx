import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendBucket } from "../../api/types";

const AXIS_LABEL_STYLE = { fontSize: 11, fill: "#3d5463" } as const;

export function formatBucketLabel(bucketStart: string, granularity: "hour" | "day"): string {
  const date = new Date(bucketStart);
  if (Number.isNaN(date.getTime())) return "";
  if (granularity === "day") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export interface TrendChartProps {
  buckets: TrendBucket[];
  granularity: "hour" | "day";
}

/** Check volume (stacked success/failure) with average latency overlaid. */
export function TrendChart({ buckets, granularity }: TrendChartProps) {
  const data = buckets.map((bucket) => ({
    label: formatBucketLabel(bucket.bucket_start, granularity),
    successful: bucket.successful,
    failed: bucket.failed,
    latency: bucket.average_latency_ms,
    total: bucket.total,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 76, 117, 0.14)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_LABEL_STYLE} interval="preserveStartEnd" minTickGap={28} />
        <YAxis
          yAxisId="checks"
          allowDecimals={false}
          tick={AXIS_LABEL_STYLE}
          width={44}
          label={{ value: "checks", angle: -90, position: "insideLeft", ...AXIS_LABEL_STYLE }}
        />
        <YAxis
          yAxisId="latency"
          orientation="right"
          tick={AXIS_LABEL_STYLE}
          width={56}
          label={{ value: "ms", angle: 90, position: "insideRight", ...AXIS_LABEL_STYLE }}
        />
        <Tooltip
          formatter={(value, name) =>
            name === "Avg latency (ms)" ? [`${value} ms`, name] : [value, name]
          }
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="checks"
          dataKey="successful"
          name="Successful checks"
          stackId="checks"
          fill="#16a34a"
        />
        <Bar
          yAxisId="checks"
          dataKey="failed"
          name="Failed checks"
          stackId="checks"
          fill="#dc2626"
        />
        <Line
          yAxisId="latency"
          dataKey="latency"
          name="Avg latency (ms)"
          stroke="#3282b8"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
