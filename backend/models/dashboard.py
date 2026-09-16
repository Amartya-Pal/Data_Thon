from datetime import date
from typing import List

from pydantic import BaseModel


class DashboardMetrics(BaseModel):
    total_arrivals: int
    total_quantity_qtl: float
    avg_modal_price: float | None
    below_msp_pct: float | None
    total_farmers: int
    active_mandis: int
    total_area_acres: float
    avg_transit_hours: float | None


class TrendPoint(BaseModel):
    period: str
    quantity_qtl: float
    arrivals: int
    avg_price: float | None
    rainfall_mm: float | None
    humidity_pct: float | None


class CropBreakdown(BaseModel):
    crop: str
    quantity_qtl: float
    share_pct: float
    avg_price: float | None
    below_msp_pct: float | None


class MandiPerformance(BaseModel):
    mandi: str
    state: str
    quantity_qtl: float
    arrivals: int
    avg_price: float | None
    below_msp_pct: float | None
    avg_transit_hours: float | None


class DestinationPoint(BaseModel):
    destination: str
    trips: int
    quantity_qtl: float


class LatestArrival(BaseModel):
    date: str
    mandi: str
    crop: str
    quantity_qtl: float
    modal_price: float | None
    msp: float | None
    price_below_msp: bool | None
    destination: str


class MspCropPoint(BaseModel):
    crop: str
    msp: float | None
    avg_modal: float | None
    gap_pct: float | None
    below_msp_pct: float | None
    priced_records: int


class FixSample(BaseModel):
    arrival_id: str
    raw: str
    cleaned: str


class QualityRule(BaseModel):
    rule: str
    label: str
    description: str
    count: int
    samples: List[FixSample]


class DataQualityReport(BaseModel):
    raw_rows: int
    clean_rows: int
    dropped_rows: int
    rows_touched: int
    total_fixes: int
    quality_score: float
    anchor_date: str
    noise_rate_pct: float
    rules: List[QualityRule]


class DashboardFilters(BaseModel):
    crops: List[str]
    states: List[str]
    districts: List[str]
    mandis: List[str]
    date_min: date
    date_max: date


class DashboardResponse(BaseModel):
    metrics: DashboardMetrics
    trend: List[TrendPoint]
    crops: List[CropBreakdown]
    mandis: List[MandiPerformance]
    destinations: List[DestinationPoint]
    latest_arrivals: List[LatestArrival]
    msp_watch: List[MspCropPoint]
    data_quality: DataQualityReport
    filters: DashboardFilters


class SeriesPoint(BaseModel):
    date: str
    quantity_qtl: float
    arrivals: int
    avg_modal: float | None
    rolling_modal: float | None
    msp: float | None


class SeriesSummary(BaseModel):
    total_quantity_qtl: float
    total_arrivals: int
    avg_modal: float | None
    priced_days: int
    days_below_msp: int
    peak_date: str | None
    peak_quantity_qtl: float


class SeriesResponse(BaseModel):
    title: str
    crop: str | None
    location: str
    location_kind: str
    days: int
    start_date: str
    end_date: str
    msp: float | None
    points: List[SeriesPoint]
    summary: SeriesSummary
