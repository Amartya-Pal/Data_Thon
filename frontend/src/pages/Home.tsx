import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Database,
  Droplets,
  Filter,
  Leaf,
  MapPinned,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Sprout,
  Sparkles,
  Truck,
  TrendingDown,
  TrendingUp,
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
import { apiGet, apiPostStream } from "@/lib/api";

interface DashboardMetrics {
  total_arrivals: number;
  total_quantity_qtl: number;
  avg_modal_price: number | null;
  below_msp_pct: number | null;
  total_farmers: number;
  active_mandis: number;
  total_area_acres: number;
  avg_transit_hours: number | null;
}

interface TrendPoint {
  period: string;
  quantity_qtl: number;
  arrivals: number;
  avg_price: number | null;
  rainfall_mm: number | null;
  humidity_pct: number | null;
}

interface CropBreakdown {
  crop: string;
  quantity_qtl: number;
  share_pct: number;
  avg_price: number | null;
  below_msp_pct: number | null;
}

interface MandiPerformance {
  mandi: string;
  state: string;
  quantity_qtl: number;
  arrivals: number;
  avg_price: number | null;
  below_msp_pct: number | null;
  avg_transit_hours: number | null;
}

interface DestinationPoint {
  destination: string;
  trips: number;
  quantity_qtl: number;
}

interface LatestArrival {
  date: string;
  mandi: string;
  crop: string;
  quantity_qtl: number;
  modal_price: number | null;
  msp: number | null;
  price_below_msp: boolean | null;
  destination: string;
}

interface DashboardFilters {
  crops: string[];
  states: string[];
  mandis: string[];
  date_min: string;
  date_max: string;
}

interface DashboardData {
  metrics: DashboardMetrics;
  trend: TrendPoint[];
  crops: CropBreakdown[];
  mandis: MandiPerformance[];
  destinations: DestinationPoint[];
  latest_arrivals: LatestArrival[];
  filters: DashboardFilters;
}

interface AiStreamEvent {
  type: "delta" | "done" | "error";
  content?: string | null;
}

interface AiQueryRequest {
  question: string;
  session_id: string;
  context: Record<string, unknown>;
}

interface DashboardFilterState {
  crop: string;
  state: string;
  mandi: string;
  dateFrom: string;
  dateTo: string;
}

const chartColors = ["#34D399", "#FBBF24", "#3B82F6", "#A78BFA", "#F97316", "#E879F9", "#94A3B8"];

const fetchDashboard = (filters: DashboardFilterState) => {
  const params = new URLSearchParams();
  if (filters.crop) params.set("crop", filters.crop);
  if (filters.state) params.set("state", filters.state);
  if (filters.mandi) params.set("mandi", filters.mandi);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiGet<DashboardData>(`/dashboard/summary${suffix}`);
};

const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);

const formatPrice = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `₹${formatNumber(value)}`;

const formatShortDate = (value: string) => {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
};

function FilterSelect({
  label,
  value,
  options,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  testId: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const labelForValue = value || `All ${label.toLowerCase()}s`;
  return (
    <label className="filter-control" data-testid={`${testId}-field`}>
      <span>{label}</span>
      <span className="filter-select-wrap">
        <button type="button" className="filter-select-trigger" data-testid={testId} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span>{labelForValue}</span><ChevronDown size={14} />
        </button>
        {open && <span className="filter-options" role="listbox" data-testid={`${testId}-menu`}>
          <button type="button" className="filter-option" data-testid={`${testId}-option-all`} onClick={() => { onChange(""); setOpen(false); }}>All {label.toLowerCase()}s</button>
          {options.map((option) => <button type="button" role="option" aria-selected={option === value} className="filter-option" data-testid={`${testId}-option-${option.toLowerCase().replaceAll(" ", "-")}`} key={option} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}
        </span>}
      </span>
    </label>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "green",
  testId,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Activity;
  tone?: "green" | "blue" | "amber" | "purple";
  testId: string;
}) {
  return (
    <Card className={`metric-card metric-${tone} rise-in`} data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="metric-label" data-testid={`${testId}-label`}>{label}</span>
          <span className="metric-icon"><Icon size={16} strokeWidth={1.8} /></span>
        </div>
        <div className="metric-value" data-testid={`${testId}-value`}>{value}</div>
        <div className="metric-caption" data-testid={`${testId}-caption`}>{caption}</div>
      </CardContent>
    </Card>
  );
}

function ChartHeader({ eyebrow, title, detail, icon: Icon }: { eyebrow: string; title: string; detail: string; icon: typeof Activity }) {
  return (
    <CardHeader className="chart-header">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="section-eyebrow"><Icon size={13} /> {eyebrow}</div>
          <CardTitle className="chart-title" data-testid={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>{title}</CardTitle>
          <p className="chart-detail">{detail}</p>
        </div>
        <span className="chart-mark" aria-hidden="true">↗</span>
      </div>
    </CardHeader>
  );
}

export default function Home() {
  const [filters, setFilters] = useState<DashboardFilterState>({ crop: "", state: "", mandi: "", dateFrom: "", dateTo: "" });
  const [rainfallThreshold, setRainfallThreshold] = useState(1300);
  const [humidityThreshold, setHumidityThreshold] = useState(70);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerFacts, setAnswerFacts] = useState<string[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [sessionId] = useState(() => `field-pulse-${Math.random().toString(36).slice(2)}`);
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
  const maxCropQuantity = useMemo(() => Math.max(...(data?.crops.map((item) => item.quantity_qtl) ?? [1])), [data?.crops]);
  const weatherAlerts = useMemo(
    () => (data?.trend ?? []).filter((point) => (point.rainfall_mm ?? 0) >= rainfallThreshold || (point.humidity_pct ?? 0) >= humidityThreshold).slice(-5).reverse(),
    [data?.trend, humidityThreshold, rainfallThreshold],
  );
  const aiContext = useMemo(() => ({
    scope: filters,
    metrics: data?.metrics,
    crops: data?.crops,
    mandis: data?.mandis.slice(0, 6),
    destinations: data?.destinations,
    recent_periods: data?.trend.slice(-6),
    weather_alerts: weatherAlerts,
  }), [data, filters, weatherAlerts]);

  const updateFilter = (key: keyof DashboardFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ crop: "", state: "", mandi: "", dateFrom: "", dateTo: "" });
    toast.success("Filters reset to the full dataset");
  };

  const refresh = async () => {
    await query.refetch();
    toast.success("Dashboard data refreshed");
  };

  const askAgent = async (preset?: string) => {
    const prompt = (preset ?? question).trim();
    if (!prompt || isAsking) return;
    setQuestion(prompt);
    setAnswer("");
    setAnswerFacts([]);
    setIsAsking(true);
    try {
      const payload: AiQueryRequest = { question: prompt, session_id: sessionId, context: aiContext };
      const stream = await apiPostStream("/ai/query", payload);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const line = rawEvent.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as AiStreamEvent;
          if (event.type === "delta" && event.content) {
            finalAnswer += event.content;
            setAnswer(finalAnswer);
          }
          if (event.type === "error") throw new Error(event.content ?? "Agent unavailable");
        }
      }
      setAnswerFacts([
        `${formatNumber(metrics?.total_arrivals)} arrivals in scope`,
        `${data?.crops.length ?? 0} crops represented`,
        `${weatherAlerts.length} weather-risk periods flagged`,
      ]);
      toast.success("Field/Pulse answered from the active scope");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Agent unavailable right now");
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar" data-testid="dashboard-header">
        <div className="brand-lockup" data-testid="brand-lockup">
          <div className="brand-icon"><Sprout size={18} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">FIELD<span>/</span>PULSE</div>
            <div className="brand-subtitle">Agritech intelligence console</div>
          </div>
        </div>
        <div className="topbar-meta">
          <div className="live-state" data-testid="live-state"><span className="status-dot" /> LIVE DATASET</div>
          <div className="topbar-divider" />
          <div className="topbar-source" data-testid="data-source-label"><Database size={13} /> Combined arrivals / 2026</div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="hero-row" data-testid="dashboard-hero">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span className="pulse-line" /> AGRI-OPS / SITUATIONAL AWARENESS</div>
            <h1>Know what the field<br /><em>is sending.</em></h1>
            <p>One clear view of market arrivals, price pressure, logistics flow, and crop momentum across the network.</p>
          </div>
          <div className="hero-signal" data-testid="hero-signal">
            <div className="signal-orbit orbit-one" />
            <div className="signal-orbit orbit-two" />
            <div className="signal-core"><Leaf size={30} /></div>
            <span className="signal-label signal-top">MARKET<br />SIGNAL</span>
            <span className="signal-label signal-bottom">{formatNumber(metrics?.active_mandis)} NODES<br />TRACKED</span>
          </div>
        </section>

        <section className="filter-bar" data-testid="dashboard-filters">
          <div className="filter-heading"><Filter size={15} /><span>Scope the signal</span>{filterCount > 0 && <Badge variant="outline" data-testid="active-filter-count">{filterCount} active</Badge>}</div>
          <div className="filter-grid">
            <FilterSelect label="Crop" value={filters.crop} options={data?.filters.crops ?? []} testId="filter-crop-select" onChange={(value) => updateFilter("crop", value)} />
            <FilterSelect label="State" value={filters.state} options={data?.filters.states ?? []} testId="filter-state-select" onChange={(value) => updateFilter("state", value)} />
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
          <MetricCard testId="metric-arrivals" label="Market arrivals" value={formatNumber(metrics?.total_arrivals)} caption="records in current scope" icon={Activity} tone="green" />
          <MetricCard testId="metric-volume" label="Volume moved" value={`${formatNumber(metrics?.total_quantity_qtl, 1)} qtl`} caption="reported arrival quantity" icon={Truck} tone="blue" />
          <MetricCard testId="metric-price" label="Modal price" value={formatPrice(metrics?.avg_modal_price)} caption="average where reported" icon={TrendingUp} tone="amber" />
          <MetricCard testId="metric-msp" label="Below MSP" value={metrics?.below_msp_pct === null || metrics?.below_msp_pct === undefined ? "—" : `${formatNumber(metrics.below_msp_pct, 1)}%`} caption="of comparable records" icon={TrendingDown} tone="purple" />
          <MetricCard testId="metric-transit" label="Transit time" value={metrics?.avg_transit_hours === null || metrics?.avg_transit_hours === undefined ? "—" : `${formatNumber(metrics.avg_transit_hours, 1)}h`} caption="average dispatch journey" icon={Route} tone="green" />
        </section>

        <section className="data-grid primary-charts" data-testid="primary-charts">
          <Card className="surface-card chart-card chart-wide rise-in" data-testid="arrival-trend-card">
            <ChartHeader icon={BarChart3} eyebrow="Arrival pulse" title="Network flow" detail="10-day movement of quantity and modal price" />
            <CardContent className="chart-content">
              <div className="chart-legend"><span><i className="legend-dot mint" /> Quantity (qtl)</span><span><i className="legend-dot amber" /> Modal price</span></div>
              <div className="chart-frame" data-testid="arrival-trend-chart">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data?.trend ?? []} margin={{ top: 10, right: 4, bottom: 0, left: -15 }}>
                    <defs><linearGradient id="quantityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34D399" stopOpacity={0.28} /><stop offset="100%" stopColor="#34D399" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="#1F2E23" strokeDasharray="2 5" vertical={false} />
                    <XAxis dataKey="period" tickFormatter={formatShortDate} tick={{ fill: "#6B7A70", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis yAxisId="quantity" tick={{ fill: "#6B7A70", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                    <YAxis yAxisId="price" orientation="right" tick={{ fill: "#6B7A70", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} />
                    <Tooltip contentStyle={{ background: "#121A14", border: "1px solid #2C4433", borderRadius: 2, color: "#F8FAF9", fontSize: 12 }} formatter={(value: number, name: string) => [name === "quantity_qtl" ? `${formatNumber(value, 1)} qtl` : formatPrice(value), name === "quantity_qtl" ? "Quantity" : "Modal price"]} labelFormatter={(label: string) => `Period ${formatShortDate(label)}`} />
                    <Area yAxisId="quantity" type="monotone" dataKey="quantity_qtl" stroke="#34D399" strokeWidth={2} fill="url(#quantityFill)" isAnimationActive animationDuration={1200} />
                    <Line yAxisId="price" type="monotone" dataKey="avg_price" stroke="#FBBF24" strokeWidth={2} dot={false} isAnimationActive animationDuration={1400} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card chart-card rise-in" data-testid="crop-mix-card">
            <ChartHeader icon={Sprout} eyebrow="Crop mix" title="What is moving" detail="Share of reported volume by crop" />
            <CardContent className="chart-content crop-chart-content">
              <div className="donut-layout" data-testid="crop-mix-chart">
                <div className="donut-frame"><ResponsiveContainer width="100%" height={178}><PieChart><Pie data={data?.crops ?? []} dataKey="quantity_qtl" nameKey="crop" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none" isAnimationActive animationDuration={1000}>{(data?.crops ?? []).map((item, index) => <Cell key={item.crop} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={{ background: "#121A14", border: "1px solid #2C4433", borderRadius: 2, color: "#F8FAF9", fontSize: 12 }} formatter={(value: number) => [`${formatNumber(value, 1)} qtl`, "Volume"]} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatNumber(metrics?.total_quantity_qtl, 0)}</strong><span>QTL</span></div></div>
                <div className="donut-legend">{(data?.crops ?? []).map((item, index) => <div className="legend-row" key={item.crop} data-testid={`crop-legend-${item.crop.toLowerCase().replaceAll(" ", "-")}`}><span><i className="legend-dot" style={{ backgroundColor: chartColors[index % chartColors.length] }} /> {item.crop}</span><strong>{formatNumber(item.share_pct, 1)}%</strong></div>)}</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="data-grid secondary-charts" data-testid="secondary-charts">
          <Card className="surface-card chart-card rise-in" data-testid="mandi-performance-card">
            <ChartHeader icon={MapPinned} eyebrow="Node performance" title="Mandi leaderboard" detail="Highest-volume markets in the current scope" />
            <CardContent className="chart-content">
              <div className="bar-chart-frame" data-testid="mandi-performance-chart"><ResponsiveContainer width="100%" height={280}><BarChart data={data?.mandis ?? []} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="#1F2E23" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="mandi" width={108} tick={{ fill: "#A1B0A6", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.replace(" Mandi", "")} /><Tooltip cursor={{ fill: "#1A241C" }} contentStyle={{ background: "#121A14", border: "1px solid #2C4433", borderRadius: 2, color: "#F8FAF9", fontSize: 12 }} formatter={(value: number) => [`${formatNumber(value, 1)} qtl`, "Volume"]} /><Bar dataKey="quantity_qtl" fill="#34D399" radius={[0, 2, 2, 0]} barSize={13} isAnimationActive animationDuration={1000} /></BarChart></ResponsiveContainer></div>
            </CardContent>
          </Card>

          <Card className="surface-card chart-card rise-in" data-testid="destination-flow-card">
            <ChartHeader icon={Route} eyebrow="Logistics flow" title="Where it goes" detail="Dispatch volume by primary destination" />
            <CardContent className="chart-content">
              <div className="destination-list" data-testid="destination-flow-list">{(data?.destinations ?? []).map((item, index) => <div className="destination-row" key={item.destination}><div className="destination-main"><span className="destination-rank">0{index + 1}</span><span>{item.destination}</span></div><div className="destination-track"><span style={{ width: `${Math.min((item.quantity_qtl / Math.max(...(data?.destinations.map((destination) => destination.quantity_qtl) ?? [1]))) * 100, 100)}%` }} /></div><div className="destination-value"><strong>{formatNumber(item.quantity_qtl, 0)}</strong><small>{formatNumber(item.trips)} trips</small></div></div>)}</div>
              <div className="destination-footnote"><Droplets size={14} /> Dispatch data is available for {formatNumber(data?.destinations.length)} destination lanes</div>
            </CardContent>
          </Card>
        </section>

        <section className="bottom-grid" data-testid="arrivals-and-climate">
          <Card className="surface-card table-card" data-testid="latest-arrivals-card">
            <CardHeader className="table-header"><div><div className="section-eyebrow"><Activity size={13} /> Latest activity</div><CardTitle className="chart-title">Recent arrivals</CardTitle></div><Badge variant="outline" data-testid="latest-arrivals-count">{formatNumber(data?.latest_arrivals.length)} records</Badge></CardHeader>
            <CardContent className="table-content"><div className="table-scroll"><table data-testid="latest-arrivals-table"><thead><tr><th>Date</th><th>Market / crop</th><th>Volume</th><th>Modal</th><th>MSP signal</th></tr></thead><tbody>{(data?.latest_arrivals ?? []).map((item, index) => <tr key={`${item.date}-${item.mandi}-${item.crop}-${index}`} data-testid={`arrival-row-${index}`}><td className="mono-text">{item.date}</td><td><strong>{item.mandi.replace(" Mandi", "")}</strong><span>{item.crop}</span></td><td className="mono-text">{formatNumber(item.quantity_qtl, 1)} qtl</td><td className="mono-text">{formatPrice(item.modal_price)}</td><td>{item.price_below_msp === null ? <span className="status-muted">Not reported</span> : <span className={item.price_below_msp ? "status-bad" : "status-good"}>{item.price_below_msp ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{item.price_below_msp ? "Below MSP" : "Above MSP"}</span>}</td></tr>)}</tbody></table></div></CardContent>
          </Card>

          <Card className="surface-card climate-card" data-testid="climate-signal-card">
            <ChartHeader icon={Droplets} eyebrow="Climate signal" title="Weather context" detail="Rainfall and humidity across the same periods" />
            <CardContent className="chart-content"><div className="climate-stat-row"><div><span>Avg humidity</span><strong>{formatNumber(data?.trend.length ? data.trend[data.trend.length - 1].humidity_pct : null, 1)}<small>%</small></strong></div><div><span>Rainfall index</span><strong>{formatNumber(data?.trend.length ? data.trend[data.trend.length - 1].rainfall_mm : null, 0)}<small> mm</small></strong></div></div><div className="chart-frame compact-chart" data-testid="climate-signal-chart"><ResponsiveContainer width="100%" height={145}><AreaChart data={data?.trend ?? []} margin={{ top: 8, right: 2, bottom: 0, left: -28 }}><defs><linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#1F2E23" strokeDasharray="2 5" vertical={false} /><XAxis dataKey="period" hide /><YAxis hide /><Tooltip contentStyle={{ background: "#121A14", border: "1px solid #2C4433", borderRadius: 2, color: "#F8FAF9", fontSize: 12 }} formatter={(value: number) => [`${formatNumber(value)} mm`, "Rainfall"]} /><Area type="monotone" dataKey="rainfall_mm" stroke="#3B82F6" fill="url(#rainFill)" strokeWidth={1.5} isAnimationActive animationDuration={1200} /></AreaChart></ResponsiveContainer></div></CardContent>
          </Card>
        </section>

        <section className="insight-grid" data-testid="insight-tools">
          <Card className="surface-card alert-card" data-testid="weather-alerts-card">
            <CardHeader className="chart-header">
              <div className="flex items-start justify-between gap-4"><div><div className="section-eyebrow"><AlertTriangle size={13} /> Risk watch</div><CardTitle className="chart-title">Weather alerts</CardTitle><p className="chart-detail">Thresholds that can slow the next logistics leg</p></div><span className={`alert-count ${weatherAlerts.length ? "is-risk" : "is-clear"}`} data-testid="weather-alert-count">{weatherAlerts.length ? `${weatherAlerts.length} flagged` : "Clear"}</span></div>
            </CardHeader>
            <CardContent className="chart-content">
              <div className="threshold-grid"><label data-testid="rainfall-threshold-field"><span>Rainfall trigger</span><div><input data-testid="rainfall-threshold-input" type="number" min="0" step="25" value={rainfallThreshold} onChange={(event) => setRainfallThreshold(Number(event.target.value) || 0)} /><small>mm</small></div></label><label data-testid="humidity-threshold-field"><span>Humidity trigger</span><div><input data-testid="humidity-threshold-input" type="number" min="0" max="100" step="1" value={humidityThreshold} onChange={(event) => setHumidityThreshold(Number(event.target.value) || 0)} /><small>%</small></div></label></div>
              <div className="alert-list" data-testid="weather-alert-list">{weatherAlerts.length ? weatherAlerts.map((alert) => <div className="alert-row" key={alert.period}><span className="alert-icon"><AlertTriangle size={14} /></span><div><strong>{formatShortDate(alert.period)} / Elevated conditions</strong><span>{(alert.rainfall_mm ?? 0) >= rainfallThreshold ? `${formatNumber(alert.rainfall_mm, 0)} mm rain` : "Rainfall normal"} · {(alert.humidity_pct ?? 0) >= humidityThreshold ? `${formatNumber(alert.humidity_pct, 1)}% humidity` : "Humidity normal"}</span></div><Badge variant="outline">Watch</Badge></div>) : <div className="clear-alert"><span className="clear-icon">✓</span><div><strong>No elevated weather signal</strong><span>Current periods sit below both logistics thresholds.</span></div></div>}</div>
            </CardContent>
          </Card>

          <Card className="surface-card ai-card" data-testid="ai-agent-card">
            <CardHeader className="chart-header"><div className="flex items-start justify-between gap-4"><div><div className="section-eyebrow"><Sparkles size={13} /> Field/Pulse analyst</div><CardTitle className="chart-title">Ask the dataset</CardTitle><p className="chart-detail">Answers are grounded in the active dashboard scope.</p></div><span className="agent-status"><span className="status-dot small" /> READY</span></div></CardHeader>
            <CardContent className="chart-content ai-content">
              <div className="suggestion-row" data-testid="ai-suggestions"><button type="button" data-testid="ai-suggestion-volume-button" onClick={() => void askAgent("Which crop is driving the most volume right now?")}>Top volume crop</button><button type="button" data-testid="ai-suggestion-risk-button" onClick={() => void askAgent("Where should the logistics team look first for risk?")}>Find risk nodes</button></div>
              <div className="ai-answer" data-testid="ai-answer"><div className="ai-answer-top"><span className="ai-spark"><Sparkles size={13} /></span><span>{isAsking ? "Reading the current scope…" : answer ? "Current scope analysis" : "Ask a precise question"}</span></div>{answer ? <p>{answer}</p> : <p className="ai-placeholder">Try “Which market has the highest volume?” or “How exposed are arrivals to below-MSP pricing?”</p>}{isAsking && <span className="typing-caret" />}{answerFacts.length > 0 && <div className="answer-facts">{answerFacts.map((fact) => <span key={fact}>· {fact}</span>)}</div>}</div>
              <form className="ai-form" onSubmit={(event) => { event.preventDefault(); void askAgent(); }}><input data-testid="ai-question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about crops, markets, price, or logistics…" /><Button type="submit" size="icon" data-testid="ai-question-submit-button" disabled={!question.trim() || isAsking}><Send size={15} /></Button></form>
              <div className="ai-footnote"><ShieldCheck size={13} /> Grounded in {formatNumber(metrics?.total_arrivals)} source records · Private server-side key</div>
            </CardContent>
          </Card>
        </section>

        <footer className="dashboard-footer" data-testid="dashboard-footer"><span><span className="status-dot small" /> Source connected</span><span>Schema: combined_agritech_dataset</span><span>Filters recalculate from source rows</span><Button variant="ghost" size="sm" className="refresh-button" data-testid="refresh-dashboard-button" onClick={() => void refresh()} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? "spin-icon" : ""} /> {query.isFetching ? "Syncing" : "Refresh"}</Button></footer>
      </main>
    </div>
  );
}