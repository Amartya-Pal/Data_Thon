// Hand-written mirrors of the backend Pydantic models (backend/models/*.py). Keep in sync.

export interface DashboardMetrics {
  total_arrivals: number;
  total_quantity_qtl: number;
  avg_modal_price: number | null;
  below_msp_pct: number | null;
  total_farmers: number;
  active_mandis: number;
  total_area_acres: number;
  avg_transit_hours: number | null;
}

export interface TrendPoint {
  period: string;
  quantity_qtl: number;
  arrivals: number;
  avg_price: number | null;
  rainfall_mm: number | null;
  humidity_pct: number | null;
}

export interface CropBreakdown {
  crop: string;
  quantity_qtl: number;
  share_pct: number;
  avg_price: number | null;
  below_msp_pct: number | null;
}

export interface MandiPerformance {
  mandi: string;
  state: string;
  quantity_qtl: number;
  arrivals: number;
  avg_price: number | null;
  below_msp_pct: number | null;
  avg_transit_hours: number | null;
}

export interface DestinationPoint {
  destination: string;
  trips: number;
  quantity_qtl: number;
}

export interface LatestArrival {
  date: string;
  mandi: string;
  crop: string;
  quantity_qtl: number;
  modal_price: number | null;
  msp: number | null;
  price_below_msp: boolean | null;
  destination: string;
}

export interface MspCropPoint {
  crop: string;
  msp: number | null;
  avg_modal: number | null;
  gap_pct: number | null;
  below_msp_pct: number | null;
  priced_records: number;
}

export interface FixSample {
  arrival_id: string;
  raw: string;
  cleaned: string;
}

export interface QualityRule {
  rule: string;
  label: string;
  description: string;
  count: number;
  samples: FixSample[];
}

export interface DataQualityReport {
  raw_rows: number;
  clean_rows: number;
  dropped_rows: number;
  rows_touched: number;
  total_fixes: number;
  quality_score: number;
  anchor_date: string;
  noise_rate_pct: number;
  rules: QualityRule[];
}

export interface DashboardFilters {
  crops: string[];
  states: string[];
  districts: string[];
  mandis: string[];
  date_min: string;
  date_max: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  trend: TrendPoint[];
  crops: CropBreakdown[];
  mandis: MandiPerformance[];
  destinations: DestinationPoint[];
  latest_arrivals: LatestArrival[];
  msp_watch: MspCropPoint[];
  data_quality: DataQualityReport;
  filters: DashboardFilters;
}

export interface SeriesPoint {
  date: string;
  quantity_qtl: number;
  arrivals: number;
  avg_modal: number | null;
  rolling_modal: number | null;
  msp: number | null;
}

export interface SeriesSummary {
  total_quantity_qtl: number;
  total_arrivals: number;
  avg_modal: number | null;
  priced_days: number;
  days_below_msp: number;
  peak_date: string | null;
  peak_quantity_qtl: number;
}

export type LocationKind = "mandi" | "district" | "state" | "all";

export interface SeriesResponse {
  title: string;
  crop: string | null;
  location: string;
  location_kind: LocationKind;
  days: number;
  start_date: string;
  end_date: string;
  msp: number | null;
  points: SeriesPoint[];
  summary: SeriesSummary;
}

export interface ChartIntent {
  crop: string | null;
  location: string | null;
  location_kind: LocationKind;
  days: number;
}

export interface AiStreamEvent {
  type: "delta" | "done" | "error" | "chart";
  content?: string | null;
  chart?: SeriesResponse | null;
  intent?: ChartIntent | null;
}

export interface AiQueryRequest {
  question: string;
  session_id: string;
  context: Record<string, unknown>;
}

export type FileCategory = "mandi-receipt" | "weather-log" | "field-photo" | "report" | "other";

export interface FileRecord {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  category: FileCategory;
  label: string | null;
  is_image: boolean;
  uploaded_at: string;
  url: string;
}

export interface FileListResponse {
  files: FileRecord[];
  total_bytes: number;
  max_file_mb: number;
  allowed_types: string[];
}

export interface DashboardFilterState {
  crop: string;
  state: string;
  district: string;
  mandi: string;
  dateFrom: string;
  dateTo: string;
}
