import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";

import { formatLongDate, formatNumber, formatPrice, formatShortDate, palette, tooltipStyle } from "@/lib/format";
import type { SeriesResponse } from "@/lib/types";

const seriesLabels: Record<string, string> = {
  quantity_qtl: "Arrivals (qtl)",
  rolling_modal: "7-day modal price",
  avg_modal: "Modal price",
};

export function SeriesChart({ series, height = 280, testId }: { series: SeriesResponse; height?: number; testId: string }) {
  const msp = series.msp;
  const hasArrivals = series.points.some((point) => point.arrivals > 0);
  if (!hasArrivals) {
    return (
      <div className="series-empty" data-testid={`${testId}-empty`}>
        No arrivals recorded for {series.crop ?? "any crop"} in {series.location} between {formatLongDate(series.start_date)} and {formatLongDate(series.end_date)}.
      </div>
    );
  }
  const priceDomain: [(min: number) => number, (max: number) => number] = [
    (min) => Math.floor((Number.isFinite(min) && min > 0 ? Math.min(min, msp ? msp * 0.92 : min) : (msp ? msp * 0.92 : 0)) / 50) * 50,
    (max) => Math.ceil((Number.isFinite(max) && max > 0 ? Math.max(max, msp ? msp * 1.08 : max) : (msp ? msp * 1.08 : 100)) / 50) * 50,
  ];
  return (
    <div className="chart-frame" style={{ minHeight: height }} data-testid={testId}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={series.points} margin={{ top: 12, right: 6, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} />
          <YAxis yAxisId="qty" tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => formatNumber(value)} />
          <YAxis yAxisId="price" orientation="right" domain={priceDomain} tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `₹${formatNumber(value)}`} />
          <Tooltip
            cursor={{ fill: "rgba(27,107,69,0.06)" }}
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => formatLongDate(label)}
            formatter={(value: number, name: string) => [name === "quantity_qtl" ? `${formatNumber(value, 1)} qtl` : formatPrice(value), seriesLabels[name] ?? name]}
          />
          <Bar yAxisId="qty" dataKey="quantity_qtl" fill={palette.green} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={900} />
          <Line yAxisId="price" type="monotone" dataKey="rolling_modal" stroke={palette.amber} strokeWidth={2.2} dot={false} connectNulls isAnimationActive animationDuration={1200} />
          <Line yAxisId="price" dataKey="avg_modal" stroke={palette.amber} strokeWidth={0} dot={{ r: 3.5, fill: palette.amber, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive animationDuration={1200} />
          {msp !== null && (
            <ReferenceLine yAxisId="price" y={msp} stroke={palette.terra} strokeDasharray="6 4" strokeWidth={1.8} label={{ value: `MSP ₹${formatNumber(msp)}`, position: "insideTopRight", fill: palette.terra, fontSize: 10, fontWeight: 700 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeriesLegend() {
  return (
    <div className="chart-legend">
      <span><i className="legend-dot mint" /> Daily arrivals (qtl)</span>
      <span><i className="legend-dot amber" /> Modal price</span>
      <span><i className="legend-dot dash" /> MSP reference</span>
    </div>
  );
}

export function SeriesStats({ series, testId }: { series: SeriesResponse; testId: string }) {
  const summary = series.summary;
  const gap = summary.avg_modal !== null && series.msp ? ((summary.avg_modal - series.msp) / series.msp) * 100 : null;
  return (
    <div className="series-stats" data-testid={testId}>
      <div><span>Total arrivals</span><strong data-testid={`${testId}-volume`}>{formatNumber(summary.total_quantity_qtl, 0)} qtl</strong></div>
      <div><span>Avg modal</span><strong data-testid={`${testId}-modal`}>{formatPrice(summary.avg_modal)}</strong></div>
      <div><span>Vs MSP</span><strong className={gap === null ? "" : gap < 0 ? "is-bad" : "is-good"} data-testid={`${testId}-gap`}>{gap === null ? "—" : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}%`}</strong></div>
      <div><span>Days below MSP</span><strong className={summary.days_below_msp ? "is-bad" : ""} data-testid={`${testId}-below`}>{summary.days_below_msp} / {summary.priced_days} priced</strong></div>
    </div>
  );
}
