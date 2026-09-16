import { useQuery } from "@tanstack/react-query";
import { LineChart, Scale } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ChartHeader } from "@/components/dashboard/primitives";
import { SeriesChart, SeriesLegend, SeriesStats } from "@/components/dashboard/SeriesChart";
import { apiGet } from "@/lib/api";
import { formatLongDate, formatNumber, formatPrice, slug } from "@/lib/format";
import type { DashboardFilterState, MspCropPoint, SeriesResponse } from "@/lib/types";

const windows = [30, 60, 90];

export const fetchSeries = (crop: string, filters: DashboardFilterState, days: number) => {
  const params = new URLSearchParams({ days: String(days) });
  if (crop) params.set("crop", crop);
  if (filters.mandi) params.set("mandi", filters.mandi);
  else if (filters.district) params.set("district", filters.district);
  else if (filters.state) params.set("state", filters.state);
  return apiGet<SeriesResponse>(`/dashboard/series?${params.toString()}`);
};

export function MspTracker({ filters, crops }: { filters: DashboardFilterState; crops: string[] }) {
  const [crop, setCrop] = useState(filters.crop || "Wheat");
  const [days, setDays] = useState(30);
  useEffect(() => {
    if (filters.crop) setCrop(filters.crop);
  }, [filters.crop]);
  const query = useQuery({
    queryKey: ["series", crop, filters.mandi, filters.district, filters.state, days],
    queryFn: () => fetchSeries(crop, filters, days),
    staleTime: 60_000,
  });
  const series = query.data;
  const cropChoices = crops.length ? crops : [crop];
  return (
    <Card className="surface-card chart-card rise-in" data-testid="msp-tracker-card">
      <ChartHeader icon={LineChart} eyebrow="MSP tracker" title="Daily arrivals vs MSP" detail={series ? `${series.location}${series.location_kind !== "all" ? ` ${series.location_kind}` : ""} · ${formatLongDate(series.start_date)} → ${formatLongDate(series.end_date)}` : "Daily market-day arrivals against the published MSP"} />
      <CardContent className="chart-content">
        <div className="series-toolbar">
          <div className="chip-row" data-testid="msp-crop-chips">
            {cropChoices.map((choice) => (
              <button type="button" key={choice} aria-pressed={choice === crop} data-testid={`msp-crop-chip-${slug(choice)}`} onClick={() => setCrop(choice)}>{choice}</button>
            ))}
          </div>
          <div className="chip-row" data-testid="msp-window-chips">
            {windows.map((window) => (
              <button type="button" key={window} aria-pressed={window === days} data-testid={`msp-window-chip-${window}`} onClick={() => setDays(window)}>{window}d</button>
            ))}
          </div>
        </div>
        <SeriesLegend />
        {series ? <SeriesChart series={series} height={250} testId="msp-tracker-chart" /> : <div className="series-empty" data-testid="msp-tracker-loading">{query.isError ? "Series unavailable right now." : "Loading market days…"}</div>}
        {series && <SeriesStats series={series} testId="msp-tracker-stats" />}
      </CardContent>
    </Card>
  );
}

export function MspWatch({ items }: { items: MspCropPoint[] }) {
  return (
    <Card className="surface-card chart-card rise-in" data-testid="msp-watch-card">
      <ChartHeader icon={Scale} eyebrow="Price floor" title="MSP watch by crop" detail="Average modal price against MSP in the current scope" />
      <CardContent className="chart-content">
        <div className="msp-list" data-testid="msp-watch-list">
          {items.map((item) => {
            const gap = item.gap_pct;
            const width = gap === null ? 0 : Math.min(Math.abs(gap) * 4, 50);
            const bad = gap !== null && gap < 0;
            return (
              <div className="msp-row" key={item.crop} data-testid={`msp-watch-row-${slug(item.crop)}`}>
                <div><strong>{item.crop}</strong><small>MSP {formatPrice(item.msp)}</small></div>
                <div className="msp-gauge" aria-hidden="true">
                  <i />
                  {gap !== null && <b className={bad ? "is-bad" : ""} style={bad ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }} />}
                </div>
                <div className={`msp-gap ${bad ? "is-bad" : ""}`}>
                  {gap === null ? "—" : `${gap >= 0 ? "+" : ""}${formatNumber(gap, 1)}%`}
                  <small>{item.below_msp_pct === null ? "no priced lots" : `${formatNumber(item.below_msp_pct, 0)}% lots below`}</small>
                </div>
              </div>
            );
          })}
        </div>
        <div className="msp-legend"><span><i className="legend-dot terra" /> MSP line</span><span><i className="legend-dot mint" /> Modal above MSP</span><span><i className="legend-dot" style={{ background: "#C2410C" }} /> Modal below MSP</span></div>
      </CardContent>
    </Card>
  );
}
