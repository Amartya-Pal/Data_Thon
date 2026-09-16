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


class DashboardFilters(BaseModel):
    crops: List[str]
    states: List[str]
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
    filters: DashboardFilters