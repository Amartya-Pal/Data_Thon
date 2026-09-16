from collections import defaultdict
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from lib.cleaning import CROP_MSP, CleanRow
from lib.dataset import average, build_series, get_dataset
from models.dashboard import (
    CropBreakdown,
    DashboardFilters,
    DashboardMetrics,
    DashboardResponse,
    DataQualityReport,
    DestinationPoint,
    LatestArrival,
    MandiPerformance,
    MspCropPoint,
    SeriesResponse,
    TrendPoint,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _bucketed_trend(rows: list[CleanRow]) -> list[TrendPoint]:
    grouped: dict[str, dict] = defaultdict(lambda: {"quantity": 0.0, "arrivals": 0, "prices": [], "rain": [], "humidity": []})
    for row in rows:
        bucket = f"{row.day.year}-{row.day.month:02d}-{((row.day.day - 1) // 10) * 10 + 1:02d}"
        group = grouped[bucket]
        group["quantity"] += row.quantity_qtl
        group["arrivals"] += 1
        if row.modal_price is not None:
            group["prices"].append(row.modal_price)
        if row.rainfall_mm is not None:
            group["rain"].append(row.rainfall_mm)
        if row.humidity_pct is not None:
            group["humidity"].append(row.humidity_pct)
    return [
        TrendPoint(
            period=key,
            quantity_qtl=round(group["quantity"], 1),
            arrivals=group["arrivals"],
            avg_price=average(group["prices"]),
            rainfall_mm=average(group["rain"]),
            humidity_pct=average(group["humidity"]),
        )
        for key, group in sorted(grouped.items())
    ]


def _below_pct(rows: list[CleanRow]) -> float | None:
    flagged = [row for row in rows if row.below_msp is not None]
    return round(sum(1 for row in flagged if row.below_msp) / len(flagged) * 100, 1) if flagged else None


def _prices(rows: list[CleanRow]) -> list[float]:
    return [row.modal_price for row in rows if row.modal_price is not None]


@router.get("/summary", response_model=DashboardResponse)
async def get_dashboard_summary(
    crop: str | None = Query(default=None),
    state: str | None = Query(default=None),
    district: str | None = Query(default=None),
    mandi: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    rows, report = await get_dataset()
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")

    scoped = rows
    if crop:
        scoped = [row for row in scoped if row.crop == crop]
    if state:
        scoped = [row for row in scoped if row.state == state]
    if district:
        scoped = [row for row in scoped if row.district == district]
    if mandi:
        scoped = [row for row in scoped if row.mandi == mandi]
    if date_from:
        scoped = [row for row in scoped if row.day >= date_from]
    if date_to:
        scoped = [row for row in scoped if row.day <= date_to]

    total_quantity = sum(row.quantity_qtl for row in scoped)
    by_crop: dict[str, list[CleanRow]] = defaultdict(list)
    by_mandi: dict[str, list[CleanRow]] = defaultdict(list)
    by_destination: dict[str, list[CleanRow]] = defaultdict(list)
    for row in scoped:
        by_crop[row.crop].append(row)
        by_mandi[row.mandi].append(row)
        by_destination[row.destination or "Unassigned"].append(row)

    crop_items = [
        CropBreakdown(
            crop=name,
            quantity_qtl=round(sum(row.quantity_qtl for row in crop_rows), 1),
            share_pct=round(sum(row.quantity_qtl for row in crop_rows) / total_quantity * 100, 1) if total_quantity else 0,
            avg_price=average(_prices(crop_rows)),
            below_msp_pct=_below_pct(crop_rows),
        )
        for name, crop_rows in by_crop.items()
    ]

    msp_watch = []
    for name, crop_rows in by_crop.items():
        msp = CROP_MSP.get(name) or next((row.msp for row in crop_rows if row.msp is not None), None)
        avg_modal = average(_prices(crop_rows))
        msp_watch.append(MspCropPoint(
            crop=name,
            msp=msp,
            avg_modal=avg_modal,
            gap_pct=round((avg_modal - msp) / msp * 100, 1) if avg_modal is not None and msp else None,
            below_msp_pct=_below_pct(crop_rows),
            priced_records=len(_prices(crop_rows)),
        ))

    mandi_items = [
        MandiPerformance(
            mandi=name,
            state=next((row.state for row in mandi_rows if row.state), "—"),
            quantity_qtl=round(sum(row.quantity_qtl for row in mandi_rows), 1),
            arrivals=len(mandi_rows),
            avg_price=average(_prices(mandi_rows)),
            below_msp_pct=_below_pct(mandi_rows),
            avg_transit_hours=average([row.transit_hours for row in mandi_rows if row.transit_hours is not None]),
        )
        for name, mandi_rows in by_mandi.items()
    ]

    destination_items = [
        DestinationPoint(
            destination=name,
            trips=int(sum(row.trips or 0 for row in dest_rows)),
            quantity_qtl=round(sum(row.quantity_qtl for row in dest_rows), 1),
        )
        for name, dest_rows in by_destination.items()
    ]

    all_days = sorted(row.day for row in rows)
    return DashboardResponse(
        metrics=DashboardMetrics(
            total_arrivals=len(scoped),
            total_quantity_qtl=round(total_quantity, 1),
            avg_modal_price=average(_prices(scoped)),
            below_msp_pct=_below_pct(scoped),
            total_farmers=round(sum(row.farmer_count or 0 for row in scoped)),
            active_mandis=len(by_mandi),
            total_area_acres=round(sum(row.area_acres or 0 for row in scoped), 1),
            avg_transit_hours=average([row.transit_hours for row in scoped if row.transit_hours is not None]),
        ),
        trend=_bucketed_trend(scoped),
        crops=sorted(crop_items, key=lambda item: item.quantity_qtl, reverse=True),
        mandis=sorted(mandi_items, key=lambda item: item.quantity_qtl, reverse=True)[:10],
        destinations=sorted(destination_items, key=lambda item: item.quantity_qtl, reverse=True),
        latest_arrivals=[
            LatestArrival(
                date=row.day.isoformat(),
                mandi=row.mandi,
                crop=row.crop,
                quantity_qtl=round(row.quantity_qtl, 1),
                modal_price=row.modal_price,
                msp=row.msp,
                price_below_msp=row.below_msp,
                destination=row.destination or "Unassigned",
            )
            for row in sorted(scoped, key=lambda item: (item.day, item.modal_price is not None), reverse=True)[:12]
        ],
        msp_watch=sorted(msp_watch, key=lambda item: item.gap_pct if item.gap_pct is not None else 999),
        data_quality=DataQualityReport(**report),
        filters=DashboardFilters(
            crops=sorted({row.crop for row in rows}),
            states=sorted({row.state for row in rows if row.state}),
            districts=sorted({row.district for row in rows if row.district}),
            mandis=sorted({row.mandi for row in rows}),
            date_min=all_days[0],
            date_max=all_days[-1],
        ),
    )


@router.get("/series", response_model=SeriesResponse)
async def get_series(
    crop: str | None = Query(default=None),
    mandi: str | None = Query(default=None),
    district: str | None = Query(default=None),
    state: str | None = Query(default=None),
    days: int = Query(default=30, ge=3, le=365),
):
    rows, _ = await get_dataset()
    if crop and crop not in {row.crop for row in rows}:
        raise HTTPException(status_code=404, detail=f"Crop '{crop}' is not in the cleaned dataset")
    if mandi:
        return build_series(rows, crop, mandi, "mandi", days)
    if district:
        return build_series(rows, crop, district, "district", days)
    if state:
        return build_series(rows, crop, state, "state", days)
    return build_series(rows, crop, None, "all", days)
