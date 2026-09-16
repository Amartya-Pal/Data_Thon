"""Shared dataset access: fetch the CSV once, run the cleaning pipeline, and offer series helpers
used by both the dashboard and AI routers."""

from __future__ import annotations

import asyncio
import csv
import io
import os
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

import httpx
from fastapi import HTTPException

from lib.cleaning import CROP_ALIASES, CROP_MSP, HINDI_CROPS, CleanRow, clean_rows
from lib.dates import today_iso
from models.dashboard import SeriesPoint, SeriesResponse, SeriesSummary

_cache: tuple[list[CleanRow], dict[str, Any]] | None = None
_load_lock = asyncio.Lock()


async def get_dataset() -> tuple[list[CleanRow], dict[str, Any]]:
    global _cache
    if _cache is not None:
        return _cache
    async with _load_lock:
        if _cache is not None:
            return _cache
        dataset_url = os.environ.get("DATASET_URL")
        if not dataset_url:
            raise HTTPException(status_code=503, detail="DATASET_URL is not configured")
        try:
            async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
                response = await client.get(dataset_url)
                response.raise_for_status()
            raw_rows = list(csv.DictReader(io.StringIO(response.text)))
        except (httpx.HTTPError, csv.Error) as exc:
            raise HTTPException(status_code=503, detail="Mandi dataset is temporarily unavailable") from exc
        _cache = await asyncio.to_thread(clean_rows, raw_rows)
    return _cache


def average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def data_horizon(rows: list[CleanRow]) -> date:
    """Last market day we can chart: the dataset's max date, never later than today."""
    latest = max(row.day for row in rows)
    return min(latest, date.fromisoformat(today_iso()))


def filter_location(rows: list[CleanRow], location: str | None, kind: str) -> list[CleanRow]:
    if not location or kind == "all":
        return rows
    key = location.lower()
    if kind == "mandi":
        return [row for row in rows if row.mandi.lower() == key]
    if kind == "district":
        return [row for row in rows if (row.district or "").lower() == key]
    return [row for row in rows if (row.state or "").lower() == key]


def build_series(rows: list[CleanRow], crop: str | None, location: str | None, kind: str, days: int) -> SeriesResponse:
    end = data_horizon(rows)
    start = end - timedelta(days=days - 1)
    scoped = filter_location(rows, location, kind)
    if crop:
        scoped = [row for row in scoped if row.crop.lower() == crop.lower()]
    scoped = [row for row in scoped if start <= row.day <= end]

    by_day: dict[date, list[CleanRow]] = defaultdict(list)
    for row in scoped:
        by_day[row.day].append(row)

    msp = CROP_MSP.get(crop) if crop else None
    if msp is None and crop:
        msp = next((row.msp for row in scoped if row.msp is not None), None)

    points: list[SeriesPoint] = []
    priced_history: list[tuple[date, float]] = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        day_rows = by_day.get(day, [])
        prices = [row.modal_price for row in day_rows if row.modal_price is not None]
        avg_modal = average(prices)
        if avg_modal is not None:
            priced_history.append((day, avg_modal))
        window = [price for stamp, price in priced_history if stamp > day - timedelta(days=7)]
        points.append(SeriesPoint(
            date=day.isoformat(),
            quantity_qtl=round(sum(row.quantity_qtl for row in day_rows), 1),
            arrivals=len(day_rows),
            avg_modal=avg_modal,
            rolling_modal=average(window),
            msp=msp,
        ))

    peak = max(points, key=lambda point: point.quantity_qtl, default=None)
    all_prices = [row.modal_price for row in scoped if row.modal_price is not None]
    crop_label = crop or "All crops"
    location_label = location if location and kind != "all" else "All markets"
    kind_label = {"mandi": "mandi", "district": "district", "state": "state", "all": ""}[kind]
    return SeriesResponse(
        title=f"{crop_label} · {location_label}{f' {kind_label}' if kind_label and location else ''} · last {days} days",
        crop=crop,
        location=location_label,
        location_kind=kind,
        days=days,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        msp=msp,
        points=points,
        summary=SeriesSummary(
            total_quantity_qtl=round(sum(point.quantity_qtl for point in points), 1),
            total_arrivals=len(scoped),
            avg_modal=average(all_prices),
            priced_days=sum(1 for point in points if point.avg_modal is not None),
            days_below_msp=sum(1 for point in points if point.avg_modal is not None and msp is not None and point.avg_modal < msp),
            peak_date=peak.date if peak and peak.quantity_qtl > 0 else None,
            peak_quantity_qtl=peak.quantity_qtl if peak else 0.0,
        ),
    )


_CHART_TRIGGERS = re.compile(r"\b(plot|chart|graph|trend|visuali[sz]e|draw|show me|vs\.?\s*msp|against (the )?msp|over the last)\b", re.IGNORECASE)
_DAYS_RE = re.compile(r"(?:last|past|previous)\s+(\d{1,3})\s*(?:days?|d\b)", re.IGNORECASE)


def parse_chart_intent(question: str, rows: list[CleanRow]) -> dict[str, Any] | None:
    """Deterministically turn a 'plot X in Y vs MSP for the last N days' question into a series spec."""
    if not _CHART_TRIGGERS.search(question):
        return None
    lowered = question.lower()

    crop: str | None = None
    for hindi, canonical in HINDI_CROPS.items():
        if hindi in question:
            crop = canonical
            break
    if crop is None:
        for alias, canonical in sorted(CROP_ALIASES.items(), key=lambda item: -len(item[0])):
            if re.search(rf"\b{re.escape(alias)}\b", lowered):
                crop = canonical
                break

    location: str | None = None
    kind = "all"
    mandis = sorted({row.mandi for row in rows}, key=len, reverse=True)
    for mandi in mandis:
        if mandi.lower() in lowered:
            location, kind = mandi, "mandi"
            break
    if location is None:
        for district in sorted({row.district for row in rows if row.district}, key=len, reverse=True):
            if re.search(rf"\b{re.escape(district.lower())}\b", lowered):
                location, kind = district, "district"
                break
    if location is None:
        for state in sorted({row.state for row in rows if row.state}, key=len, reverse=True):
            if state.lower() in lowered:
                location, kind = state, "state"
                break

    days = 30
    match = _DAYS_RE.search(question)
    if match:
        days = max(3, min(int(match.group(1)), 365))
    elif re.search(r"\b(this|last|past)\s+week\b", lowered):
        days = 7
    elif re.search(r"\b(this|last|past)\s+quarter\b", lowered):
        days = 90
    elif re.search(r"\b(this|last|past)\s+(month|30 days)\b", lowered):
        days = 30
    return {"crop": crop, "location": location, "location_kind": kind, "days": days}
