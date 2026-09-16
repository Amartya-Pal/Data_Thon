import asyncio
import csv
import io
import os
from collections import defaultdict
from datetime import date
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from models.dashboard import (
    CropBreakdown,
    DashboardFilters,
    DashboardMetrics,
    DashboardResponse,
    DestinationPoint,
    LatestArrival,
    MandiPerformance,
    TrendPoint,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
_rows: list[dict[str, str]] | None = None
_load_lock = asyncio.Lock()


def _number(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _positive(value: float | None) -> float:
    return value if value is not None else 0.0


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


async def _get_rows() -> list[dict[str, str]]:
    global _rows
    if _rows is not None:
        return _rows
    async with _load_lock:
        if _rows is not None:
            return _rows
        dataset_url = os.environ.get("DATASET_URL")
        if not dataset_url:
            raise HTTPException(status_code=503, detail="DATASET_URL is not configured")
        try:
            async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
                response = await client.get(dataset_url)
                response.raise_for_status()
            _rows = list(csv.DictReader(io.StringIO(response.text)))
        except (httpx.HTTPError, csv.Error) as exc:
            raise HTTPException(status_code=503, detail="Agritech dataset is temporarily unavailable") from exc
    return _rows


def _bucketed_trend(rows: list[dict[str, str]]) -> list[TrendPoint]:
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"quantity": 0.0, "arrivals": 0, "prices": [], "rain": [], "humidity": []})
    for row in rows:
        raw_date = row.get("date", "")
        if not raw_date:
            continue
        try:
            parsed = date.fromisoformat(raw_date)
        except ValueError:
            continue
        bucket = f"{parsed.year}-{parsed.month:02d}-{((parsed.day - 1) // 10) * 10 + 1:02d}"
        group = grouped[bucket]
        group["quantity"] += _positive(_number(row.get("arrival_quantity_qtl")))
        group["arrivals"] += 1
        for field, key in (("modal_price", "prices"), ("statewide_total_rainfall_mm", "rain"), ("statewide_avg_humidity_pct", "humidity")):
            value = _number(row.get(field))
            if value is not None:
                group[key].append(value)
    return [
        TrendPoint(
            period=key,
            quantity_qtl=round(group["quantity"], 1),
            arrivals=group["arrivals"],
            avg_price=_average(group["prices"]),
            rainfall_mm=_average(group["rain"]),
            humidity_pct=_average(group["humidity"]),
        )
        for key, group in sorted(grouped.items())
    ]


@router.get("/summary", response_model=DashboardResponse)
async def get_dashboard_summary(
    crop: str | None = Query(default=None),
    state: str | None = Query(default=None),
    mandi: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    rows = await _get_rows()
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")

    cleaned = [row for row in rows if row.get("crop_name") and row.get("date")]
    filter_rows = cleaned
    if crop:
        filter_rows = [row for row in filter_rows if row.get("crop_name") == crop]
    if state:
        filter_rows = [row for row in filter_rows if row.get("state") == state]
    if mandi:
        filter_rows = [row for row in filter_rows if row.get("mandi_name") == mandi]
    if date_from:
        filter_rows = [row for row in filter_rows if row.get("date", "") >= date_from.isoformat()]
    if date_to:
        filter_rows = [row for row in filter_rows if row.get("date", "") <= date_to.isoformat()]

    quantity = [_positive(_number(row.get("arrival_quantity_qtl"))) for row in filter_rows]
    farmers = [_number(row.get("farmer_count")) for row in filter_rows]
    area = [_number(row.get("total_area_acres")) for row in filter_rows]
    prices = [value for value in (_number(row.get("modal_price")) for row in filter_rows) if value is not None]
    transit = [value for value in (_number(row.get("avg_transit_hours")) for row in filter_rows) if value is not None]
    msp_rows = [row for row in filter_rows if row.get("price_below_msp") in {"True", "False"}]
    below_msp = [row for row in msp_rows if row.get("price_below_msp") == "True"]

    by_crop: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_mandi: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_destination: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in filter_rows:
        by_crop[row.get("crop_name", "Unknown")].append(row)
        by_mandi[row.get("mandi_name", "Unknown")].append(row)
        destination = row.get("primary_destination") or "Unassigned"
        by_destination[destination].append(row)

    crop_items = []
    for crop_name, crop_rows in by_crop.items():
        crop_quantity = sum(_positive(_number(row.get("arrival_quantity_qtl"))) for row in crop_rows)
        crop_msp = [row for row in crop_rows if row.get("price_below_msp") in {"True", "False"}]
        crop_below = [row for row in crop_msp if row.get("price_below_msp") == "True"]
        crop_items.append(CropBreakdown(
            crop=crop_name,
            quantity_qtl=round(crop_quantity, 1),
            share_pct=round(crop_quantity / sum(quantity) * 100, 1) if sum(quantity) else 0,
            avg_price=_average([value for value in (_number(row.get("modal_price")) for row in crop_rows) if value is not None]),
            below_msp_pct=round(len(crop_below) / len(crop_msp) * 100, 1) if crop_msp else None,
        ))

    mandi_items = []
    for mandi_name, mandi_rows in by_mandi.items():
        mandi_msp = [row for row in mandi_rows if row.get("price_below_msp") in {"True", "False"}]
        mandi_below = [row for row in mandi_msp if row.get("price_below_msp") == "True"]
        mandi_items.append(MandiPerformance(
            mandi=mandi_name,
            state=next((row.get("state") for row in mandi_rows if row.get("state")), "—"),
            quantity_qtl=round(sum(_positive(_number(row.get("arrival_quantity_qtl"))) for row in mandi_rows), 1),
            arrivals=len(mandi_rows),
            avg_price=_average([value for value in (_number(row.get("modal_price")) for row in mandi_rows) if value is not None]),
            below_msp_pct=round(len(mandi_below) / len(mandi_msp) * 100, 1) if mandi_msp else None,
            avg_transit_hours=_average([value for value in (_number(row.get("avg_transit_hours")) for row in mandi_rows) if value is not None]),
        ))

    destination_items = [DestinationPoint(
        destination=destination,
        trips=sum(int(_positive(_number(row.get("trips_dispatched")))) for row in destination_rows),
        quantity_qtl=round(sum(_positive(_number(row.get("arrival_quantity_qtl"))) for row in destination_rows), 1),
    ) for destination, destination_rows in by_destination.items()]

    available_dates = sorted(row["date"] for row in cleaned)
    return DashboardResponse(
        metrics=DashboardMetrics(
            total_arrivals=len(filter_rows),
            total_quantity_qtl=round(sum(quantity), 1),
            avg_modal_price=_average(prices),
            below_msp_pct=round(len(below_msp) / len(msp_rows) * 100, 1) if msp_rows else None,
            total_farmers=round(sum(_positive(value) for value in farmers)),
            active_mandis=len({row.get("mandi_name") for row in filter_rows}),
            total_area_acres=round(sum(_positive(value) for value in area), 1),
            avg_transit_hours=_average(transit),
        ),
        trend=_bucketed_trend(filter_rows),
        crops=sorted(crop_items, key=lambda item: item.quantity_qtl, reverse=True),
        mandis=sorted(mandi_items, key=lambda item: item.quantity_qtl, reverse=True)[:10],
        destinations=sorted(destination_items, key=lambda item: item.quantity_qtl, reverse=True),
        latest_arrivals=[LatestArrival(
            date=row.get("date", ""),
            mandi=row.get("mandi_name", "Unknown"),
            crop=row.get("crop_name", "Unknown"),
            quantity_qtl=round(_positive(_number(row.get("arrival_quantity_qtl"))), 1),
            modal_price=_number(row.get("modal_price")),
            msp=_number(row.get("msp")),
            price_below_msp=True if row.get("price_below_msp") == "True" else False if row.get("price_below_msp") == "False" else None,
            destination=row.get("primary_destination") or "Unassigned",
        ) for row in sorted(filter_rows, key=lambda item: item.get("date", ""), reverse=True)[:12]],
        filters=DashboardFilters(
            crops=sorted({row["crop_name"] for row in cleaned if row.get("crop_name")}),
            states=sorted({row["state"] for row in cleaned if row.get("state")}),
            mandis=sorted({row["mandi_name"] for row in cleaned if row.get("mandi_name")}),
            date_min=date.fromisoformat(available_dates[0]),
            date_max=date.fromisoformat(available_dates[-1]),
        ),
    )