import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Database,
  Droplets,
  Filter,
  MapPinned,
  RefreshCw,
  Route,
  Sprout,
  Truck,
  TrendingDown,
  TrendingUp,
  Wheat,
  Wifi,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentPanel } from "@/components/dashboard/AgentPanel";
import { DataQualityPanel } from "@/components/dashboard/DataQualityPanel";
import { FilesPanel } from "@/components/dashboard/FilesPanel";
import { MspTracker, MspWatch } from "@/components/dashboard/MspTracker";
import { ChartHeader, FilterSelect, MetricCard } from "@/components/dashboard/primitives";
import { WeatherAlerts } from "@/components/dashboard/WeatherAlerts";
import { apiGet } from "@/lib/api";
import { chartColors, formatLongDate, formatNumber, formatPrice, formatShortDate, palette, slug, tooltipStyle } from "@/lib/format";
import type { DashboardData, DashboardFilterState } from "@/lib/types";

const emptyFilters: DashboardFilterState = { crop: "", state: "", district: "", mandi: "", dateFrom: "", dateTo: "" };

const fetchDashboard = (filters: DashboardFilterState) => {
  const params = new URLSearchParams();
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.state) params.set("state", filters.state);
  if (filters.district) params.set("district", filters.district);
  if (filters.mandi) params.set("mandi", filters.mandi);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiGet<DashboardData>(`/dashboard/summary${suffix}`);
};

export default function Home() {
  const [filters, setFilters] = useState<DashboardFilterState>(emptyFilters);
  const [rainfallThreshold, setRainfallThreshold] = useState(1300);
  const [humidityThreshold, setHumidityThreshold] = useState(70);
  const query = useQuery({
    queryKey: ["dashboard-summary", filters],
    queryFn: () => fetchDashboard(filters),
    retry: 1,
    staleTime: 60_000,
  });
  const data = query.data;
  const metrics = data?.metrics;
  const hasFilters = Object.values(filters).some(Boolean);
  const filterCount = Object.values(filters).filter(Boolean).length;
  const weatherAlerts = useMemo(
    () => (data?.trend ?? []).filter((point) => (point.rainfall_mm ?? 0) >= rainfallThreshold || (point.humidity_pct ?? 0) >= humidityThreshold).slice(-5).reverse(),
    [data?.trend, humidityThreshold, rainfallThreshold],
  );
  const aiContext = useMemo(() => ({
    scope: filters,
    metrics: data?.metrics,
    crops: data?.crops,
    msp_watch: data?.msp_watch,
    mandis: data?.mandis.slice(0, 6),
    destinations: data?.destinations,
    recent_periods: data?.trend.slice(-6),
    weather_alerts: weatherAlerts,
    data_quality: data ? { quality_score: data.data_quality.quality_score, total_fixes: data.data_quality.total_fixes, rules: data.data_quality.rules.map((rule) => ({ rule: rule.label, count: rule.count })) } : undefined,
  }), [data, filters, weatherAlerts]);
  const maxDestination = Math.max(...(data?.destinations.map((item) => item.quantity_qtl) ?? [1]));

  const updateFilter = (key: keyof DashboardFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    toast.success("Filters reset to the full dataset");
  };

  const refresh = async () => {
    await query.refetch();
    toast.success("Dashboard data refreshed");
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar" data-testid="dashboard-header">
        <div className="brand-lockup" data-testid="brand-lockup">
          <div className="brand-icon"><Wheat size={18} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">MANDI<span>/</span>PULSE</div>
            <div className="brand-subtitle">Mandi-to-Market Supply Chain Optimizer · State Agriculture Board</div>
          </div>
        </div>
        <div className="topbar-meta">
          <div className="live-state" data-testid="live-state"><span className="status-dot" /> CLEANED FEED</div>
          <div className="topbar-divider" />
          <div className="topbar-source" data-testid="data-source-label"><Database size={13} /> {formatNumber(data?.data_quality.clean_rows)} arrivals · {data ? formatLongDate(data.filters.date_min) : "…"} → {data ? formatLongDate(data.filters.date_max) : "…"}</div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="hero-row" data-testid="dashboard-hero">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span className="pulse-line" /> TRACK 3 · AGRITECH · MANDI TO MARKET</div>
            <h1>From mandi gate<br />to <em>market shelf.</em></h1>
            <p>Daily crop arrivals across {formatNumber(metrics?.active_mandis)} mandis, modal prices tracked against MSP, and weather correlated with the next logistics leg — all from one cleaned feed.</p>
            <div className="hero-chips" data-testid="hero-chips">
              <span><i style={{ background: palette.green }} /> Hindi + English crop labels unified</span>
              <span><i style={{ background: palette.amber }} /> kg → quintal normalised</span>
              <span><i style={{ background: palette.blue }} /> UTC sensor stamps → IST market day</span>
            </div>
          </div>
          <div className="hero-signal" data-testid="hero-signal">
            <div className="signal-orbit orbit-one" />
            <div className="signal-orbit orbit-two" />
            <div className="signal-core"><Sprout size={30} /></div>
            <span className="signal-label signal-top">MARKET<br />SIGNAL</span>
            <span className="signal-label signal-bottom">{formatNumber(metrics?.active_mandis)} MANDIS<br />TRACKED</span>
          </div>
        </section>

        <section className="filter-bar" data-testid="dashboard-filters">
          <div className="filter-heading"><Filter size={15} /><span>Scope the signal</span>{filterCount > 0 && <Badge variant="outline" data-testid="active-filter-count">{filterCount} active</Badge>}</div>
          <div className="filter-grid">
            <FilterSelect label="Crop" value={filters.crop} options={data?.filters.crops ?? []} testId="filter-crop-select" onChange={(value) => updateFilter("crop", value)} />
            <FilterSelect label="State" value={filters.state} options={data?.filters.states ?? []} testId="filter-state-select" onChange={(value) => updateFilter("state", value)} />
            <FilterSelect label="District" value={filters.district} options={data?.filters.districts ?? []} testId="filter-district-select" onChange={(value) => updateFilter("district", value)} />
            <FilterSelect label="Mandi" value={filters.mandi} options={data?.filters.mandis ?? []} testId="filter-mandi-select" onChange={(value) => updateFilter("mandi", value)} />
            <label className="filter-control" data-testid="filter-date-from-field"><span>From</span><input data-testid="filter-date-from-input" type="date" value={filters.dateFrom || data?.filters.date_min || ""} min={data?.filters.date_min} max={data?.filters.date_max} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
            <label className="filter-control" data-testid="filter-date-to-field"><span>To</span><input data-testid="filter-date-to-input" type="date" value={filters.dateTo || data?.filters.date_max || ""} min={data?.filters.date_min} max={data?.filters.date_max} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
            <Button className="reset-button" variant="ghost" size="sm" data-testid="reset-filters-button" onClick={resetFilters} disabled={!hasFilters}><X size={14} /> Reset</Button>
          </div>
        </section>

        {query.isError && (
          <div className="data-alert" data-testid="dashboard-error"><Wifi size={16} /> Data is taking a moment to reconnect. <button data-testid="dashboard-retry-button" onClick={() => void query.refetch()}>Retry</button></div>
        )}

        <section className="metric-grid" data-testid="dashboard-metrics">
          <MetricCard testId="metric-arrivals" label="Mandi arrivals" value={formatNumber(metrics?.total_arrivals)} caption="cleaned arrival records in scope" icon={Activity} tone="green" />
          <MetricCard testId="metric-volume" label="Volume arrived" value={`${formatNumber(metrics?.total_quantity_qtl, 0)} qtl`} caption="all quantities normalised to quintals" icon={Truck} tone="blue" />
          <MetricCard testId="metric-price" label="Modal price" value={formatPrice(metrics?.avg_modal_price)} caption="average where a price was reported" icon={TrendingUp} tone="amber" />
          <MetricCard testId="metric-msp" label="Lots below MSP" value={metrics?.below_msp_pct === null || metrics?.below_msp_pct === undefined ? "—" : `${formatNumber(metrics.below_msp_pct, 1)}%`} caption="of priced lots (MSP backfilled per crop)" icon={TrendingDown} tone="terra" />
          <MetricCard testId="metric-transit" label="Transit time" value={metrics?.avg_transit_hours === null || metrics?.avg_transit_hours === undefined ? "—" : `${formatNumber(metrics.avg_transit_hours, 1)}h`} caption="average mandi-to-market journey" icon={Route} tone="purple" />
        </section>

        <section className="data-grid primary-charts" data-testid="primary-charts">
          <Card className="surface-card chart-card chart-wide rise-in" data-testid="arrival-trend-card">
            <ChartHeader icon={BarChart3} eyebrow="Arrival pulse" title="Network flow" detail="10-day movement of arrival volume and modal price" />
            <CardContent className="chart-content">
              <div className="chart-legend"><span><i className="legend-dot mint" /> Quantity (qtl)</span><span><i className="legend-dot amber" /> Modal price</span></div>
              <div className="chart-frame" data-testid="arrival-trend-chart">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data?.trend ?? []} margin={{ top: 10, right: 4, bottom: 0, left: -15 }}>
                    <defs><linearGradient id="quantityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.green} stopOpacity={0.32} /><stop offset="100%" stopColor={palette.green} stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid stroke={palette.grid} strokeDasharray="2 5" vertical={false} />
                    <XAxis dataKey="period" tickFormatter={formatShortDate} tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis yAxisId="quantity" tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                    <YAxis yAxisId="price" orientation="right" tick={{ fill: palette.tick, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `₹${formatNumber(value)}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [name === "quantity_qtl" ? `${formatNumber(value, 1)} qtl` : formatPrice(value), name === "quantity_qtl" ? "Quantity" : "Modal price"]} labelFormatter={(label: string) => `Period starting ${formatLongDate(label)}`} />
                    <Area yAxisId="quantity" type="monotone" dataKey="quantity_qtl" stroke={palette.green} strokeWidth={2.2} fill="url(#quantityFill)" isAnimationActive animationDuration={1200} />
                    <Line yAxisId="price" type="monotone" dataKey="avg_price" stroke={palette.amber} strokeWidth={2.2} dot={false} connectNulls isAnimationActive animationDuration={1400} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card chart-card rise-in" data-testid="crop-mix-card">
            <ChartHeader icon={Sprout} eyebrow="Crop mix" title="What is arriving" detail="Share of normalised volume by canonical crop" />
            <CardContent className="chart-content crop-chart-content">
              <div className="donut-layout" data-testid="crop-mix-chart">
                <div className="donut-frame">
                  <ResponsiveContainer width="100%" height={178}>
                    <PieChart>
                      <Pie data={data?.crops ?? []} dataKey="quantity_qtl" nameKey="crop" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none" isAnimationActive animationDuration={1000}>
                        {(data?.crops ?? []).map((item, index) => <Cell key={item.crop} fill={chartColors[index % chartColors.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${formatNumber(value, 1)} qtl`, "Volume"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><strong>{formatNumber(metrics?.total_quantity_qtl, 0)}</strong><span>QTL</span></div>
                </div>
                <div className="donut-legend">
                  {(data?.crops ?? []).map((item, index) => (
                    <div className="legend-row" key={item.crop} data-testid={`crop-legend-${slug(item.crop)}`}><span><i className="legend-dot" style={{ backgroundColor: chartColors[index % chartColors.length] }} /> {item.crop}</span><strong>{formatNumber(item.share_pct, 1)}%</strong></div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="data-grid msp-grid" data-testid="msp-section">
          <MspTracker filters={filters} crops={data?.filters.crops ?? []} />
          <MspWatch items={data?.msp_watch ?? []} />
        </section>

        <section className="data-grid secondary-charts" data-testid="secondary-charts">
          <Card className="surface-card chart-card rise-in" data-testid="mandi-performance-card">
            <ChartHeader icon={MapPinned} eyebrow="Node performance" title="Mandi leaderboard" detail="Highest-volume markets in the current scope" />
            <CardContent className="chart-content">
              <div className="bar-chart-frame" data-testid="mandi-performance-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data?.mandis ?? []} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke={palette.grid} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="mandi" width={118} tick={{ fill: palette.ink, fontSize: 10.5 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.replace(" Mandi", "")} />
                    <Tooltip cursor={{ fill: "rgba(27,107,69,0.06)" }} contentStyle={tooltipStyle} formatter={(value: number) => [`${formatNumber(value, 1)} qtl`, "Volume"]} />
                    <Bar dataKey="quantity_qtl" fill={palette.green} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card chart-card rise-in" data-testid="destination-flow-card">
            <ChartHeader icon={Route} eyebrow="Logistics flow" title="Where it goes" detail="Dispatch volume by primary destination" />
            <CardContent className="chart-content">
              <div className="destination-list" data-testid="destination-flow-list">
                {(data?.destinations ?? []).map((item, index) => (
                  <div className="destination-row" key={item.destination}>
                    <div className="destination-main"><span className="destination-rank">0{index + 1}</span><span>{item.destination}</span></div>
                    <div className="destination-track"><span style={{ width: `${Math.min((item.quantity_qtl / maxDestination) * 100, 100)}%` }} /></div>
                    <div className="destination-value"><strong>{formatNumber(item.quantity_qtl, 0)}</strong><small>{formatNumber(item.trips)} trips</small></div>
                  </div>
                ))}
              </div>
              <div className="destination-footnote"><Droplets size={14} /> Dispatch data is available for {formatNumber(data?.destinations.length)} destination lanes</div>
            </CardContent>
          </Card>
        </section>

        <section className="bottom-grid" data-testid="arrivals-and-climate">
          <Card className="surface-card table-card" data-testid="latest-arrivals-card">
            <CardHeader className="table-header"><div><div className="section-eyebrow"><Activity size={13} /> Latest activity</div><CardTitle className="chart-title">Recent arrivals</CardTitle></div><Badge variant="outline" data-testid="latest-arrivals-count">{formatNumber(data?.latest_arrivals.length)} records</Badge></CardHeader>
            <CardContent className="table-content">
              <div className="table-scroll">
                <table data-testid="latest-arrivals-table">
                  <thead><tr><th>Market day</th><th>Mandi / crop</th><th>Volume</th><th>Modal</th><th>MSP</th><th>MSP signal</th></tr></thead>
                  <tbody>
                    {(data?.latest_arrivals ?? []).map((item, index) => (
                      <tr key={`${item.date}-${item.mandi}-${item.crop}-${index}`} data-testid={`arrival-row-${index}`}>
                        <td className="mono-text">{item.date}</td>
                        <td><strong>{item.mandi.replace(" Mandi", "")}</strong><span>{item.crop} → {item.destination}</span></td>
                        <td className="mono-text">{formatNumber(item.quantity_qtl, 1)} qtl</td>
                        <td className="mono-text">{formatPrice(item.modal_price)}</td>
                        <td className="mono-text">{formatPrice(item.msp)}</td>
                        <td>{item.price_below_msp === null ? <span className="status-muted">Not priced</span> : <span className={item.price_below_msp ? "status-bad" : "status-good"}>{item.price_below_msp ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{item.price_below_msp ? "Below MSP" : "At / above MSP"}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card climate-card" data-testid="climate-signal-card">
            <ChartHeader icon={Droplets} eyebrow="Climate signal" title="Weather context" detail="Statewide rainfall and humidity across the same periods" />
            <CardContent className="chart-content">
              <div className="climate-stat-row">
                <div><span>Avg humidity</span><strong>{formatNumber(data?.trend.length ? data.trend[data.trend.length - 1].humidity_pct : null, 1)}<small>%</small></strong></div>
                <div><span>Rainfall index</span><strong>{formatNumber(data?.trend.length ? data.trend[data.trend.length - 1].rainfall_mm : null, 0)}<small> mm</small></strong></div>
              </div>
              <div className="chart-frame compact-chart" data-testid="climate-signal-chart">
                <ResponsiveContainer width="100%" height={145}>
                  <AreaChart data={data?.trend ?? []} margin={{ top: 8, right: 2, bottom: 0, left: -28 }}>
                    <defs><linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={palette.blue} stopOpacity={0.32} /><stop offset="100%" stopColor={palette.blue} stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid stroke={palette.grid} strokeDasharray="2 5" vertical={false} />
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${formatNumber(value)} mm`, "Rainfall"]} labelFormatter={(label: string) => `Period starting ${formatLongDate(label)}`} />
                    <Area type="monotone" dataKey="rainfall_mm" stroke={palette.blue} fill="url(#rainFill)" strokeWidth={1.8} isAnimationActive animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="insight-grid" data-testid="insight-tools">
          <WeatherAlerts alerts={weatherAlerts} rainfallThreshold={rainfallThreshold} humidityThreshold={humidityThreshold} onRainfallChange={setRainfallThreshold} onHumidityChange={setHumidityThreshold} />
          <AgentPanel context={aiContext} recordCount={metrics?.total_arrivals} alertCount={weatherAlerts.length} cropCount={data?.crops.length ?? 0} />
        </section>

        {data && <DataQualityPanel report={data.data_quality} />}

        <section className="data-grid" data-testid="storage-section">
          <FilesPanel />
        </section>

        <footer className="dashboard-footer" data-testid="dashboard-footer">
          <span><span className="status-dot small" /> Source connected</span>
          <span>Schema: combined_agritech_dataset → cleaned</span>
          <span>Filters recalculate from cleaned rows</span>
          <Button variant="ghost" size="sm" className="refresh-button" data-testid="refresh-dashboard-button" onClick={() => void refresh()} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? "spin-icon" : ""} /> {query.isFetching ? "Syncing" : "Refresh"}</Button>
        </footer>
      </main>
    </div>
  );
}
