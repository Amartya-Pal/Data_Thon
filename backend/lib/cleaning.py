"""Mandi arrivals normalization pipeline.

Raw CSV rows arrive "messy": crop names mixed in English/Hindi/romanized Hindi, quantities carrying
kg/quintal labels, timestamps in UTC or DD/MM/YYYY IST strings, month/day swaps, missing states and
MSP values. `clean_rows()` turns them into typed `CleanRow`s and records every fix it applied so the
dashboard can show a Data Quality report.
"""

from __future__ import annotations

import os
import random
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from lib.dates import today_iso

IST = ZoneInfo("Asia/Kolkata")

CROP_MSP: dict[str, float] = {
    "Wheat": 2275.0,
    "Rice": 2183.0,
    "Basmati": 2183.0,
    "Maize": 2090.0,
    "Mustard": 5650.0,
    "Sugarcane": 3500.0,
    "Cotton": 6620.0,
}

HINDI_CROPS: dict[str, str] = {
    "गेहूं": "Wheat", "गेहूँ": "Wheat", "गेहू": "Wheat",
    "सरसों": "Mustard", "सरसो": "Mustard",
    "गन्ना": "Sugarcane",
    "मक्का": "Maize", "मकई": "Maize",
    "कपास": "Cotton",
    "चावल": "Rice", "धान": "Rice",
    "बासमती": "Basmati",
}

CROP_ALIASES: dict[str, str] = {
    "wheat": "Wheat", "gehu": "Wheat", "gehun": "Wheat", "gehoon": "Wheat",
    "mustard": "Mustard", "sarson": "Mustard", "sarso": "Mustard", "rai": "Mustard",
    "sugarcane": "Sugarcane", "ganna": "Sugarcane", "sugar cane": "Sugarcane",
    "maize": "Maize", "makka": "Maize", "makai": "Maize", "corn": "Maize",
    "cotton": "Cotton", "kapas": "Cotton",
    "rice": "Rice", "chawal": "Rice", "dhan": "Rice", "paddy": "Rice",
    "basmati": "Basmati", "basmati rice": "Basmati",
}

# Reverse maps used only for injecting realistic noise into a share of the rows.
_HINDI_BY_CROP: dict[str, list[str]] = defaultdict(list)
for _hindi, _crop in HINDI_CROPS.items():
    _HINDI_BY_CROP[_crop].append(_hindi)
_ROMAN_BY_CROP: dict[str, list[str]] = {
    "Wheat": ["Gehu", "GEHUN"], "Mustard": ["Sarson", "sarso"], "Sugarcane": ["Ganna", "SUGAR CANE"],
    "Maize": ["Makka", "makai"], "Cotton": ["Kapas", "COTTON "], "Rice": ["Dhan", "Paddy", "chawal"],
    "Basmati": ["basmati rice", " Basmati "],
}

RULES: dict[str, tuple[str, str]] = {
    "crop_hindi": ("Hindi crop names translated", "Devanagari crop labels (गेहूं, सरसों, धान…) mapped to canonical English names."),
    "crop_alias": ("Romanized / inconsistent crop labels", "Transliterations, casing and whitespace variants (Gehu, KAPAS, paddy) collapsed to one label."),
    "unit_convert": ("Kg / tonne converted to quintals", "Quantities logged in kilograms or tonnes rescaled to quintals (100 kg = 1 qtl)."),
    "unit_label": ("Unit labels stripped", "Quantities carrying an explicit 'Qtl' / 'quintal' suffix parsed to plain numbers."),
    "tz_utc": ("UTC timestamps shifted to IST", "Sensor-style UTC timestamps converted to Asia/Kolkata before taking the market day."),
    "date_format": ("DD/MM/YYYY strings parsed", "Indian-format date strings (with optional IST time) parsed to ISO dates."),
    "future_swap": ("Month/day swaps repaired", "Dates beyond today with day <= 12 were month/day swapped; corrected by swapping back."),
    "state_inferred": ("Missing state inferred", "Blank state filled from the district → state mapping observed in the rest of the data."),
    "msp_backfilled": ("MSP backfilled per crop", "Missing MSP filled with the crop's published MSP; below-MSP flag derived from modal price."),
    "dropped": ("Rows quarantined", "Rows with an unparsable date, crop or quantity were excluded from analysis."),
}


@dataclass(slots=True)
class CleanRow:
    arrival_id: str
    day: date
    crop: str
    variety: str | None
    mandi: str
    district: str | None
    state: str | None
    mandi_type: str
    quantity_qtl: float
    farmer_count: float | None
    area_acres: float | None
    min_price: float | None
    max_price: float | None
    modal_price: float | None
    msp: float | None
    below_msp: bool | None
    trips: float | None
    transit_hours: float | None
    distance_km: float | None
    destination: str | None
    temp_c: float | None
    rainfall_mm: float | None
    humidity_pct: float | None


@dataclass
class QualityLog:
    counts: Counter = field(default_factory=Counter)
    samples: dict[str, list[dict[str, str]]] = field(default_factory=lambda: defaultdict(list))
    touched: set[str] = field(default_factory=set)

    def record(self, rule: str, arrival_id: str, raw: Any, cleaned: Any) -> None:
        self.counts[rule] += 1
        self.touched.add(arrival_id)
        if len(self.samples[rule]) < 6:
            self.samples[rule].append({"arrival_id": arrival_id, "raw": str(raw), "cleaned": str(cleaned)})


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


_QTY_RE = re.compile(r"^\s*([\d.,]+)\s*([A-Za-z ]*)\s*$")


def parse_quantity(raw: str | None, arrival_id: str, log: QualityLog) -> float | None:
    if raw is None:
        return None
    match = _QTY_RE.match(raw)
    if not match:
        return None
    value = _number(match.group(1))
    if value is None:
        return None
    unit = match.group(2).strip().lower()
    if unit in {"", "qtl", "q", "quintal", "quintals", "qtls"}:
        if unit:
            log.record("unit_label", arrival_id, raw, f"{value:g} qtl")
        return value
    if unit in {"kg", "kgs", "kilogram", "kilograms"}:
        converted = round(value / 100, 2)
        log.record("unit_convert", arrival_id, raw, f"{converted:g} qtl")
        return converted
    if unit in {"t", "mt", "ton", "tons", "tonne", "tonnes"}:
        converted = round(value * 10, 2)
        log.record("unit_convert", arrival_id, raw, f"{converted:g} qtl")
        return converted
    return None


_DMY_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?(?:\s*IST)?$")


def parse_day(raw: str | None, arrival_id: str, anchor: date, log: QualityLog) -> date | None:
    if not raw:
        return None
    text = raw.strip()
    parsed: date | None = None
    try:
        parsed = date.fromisoformat(text)
    except ValueError:
        parsed = None
    if parsed is None:
        dmy = _DMY_RE.match(text)
        if dmy:
            try:
                parsed = date(int(dmy.group(3)), int(dmy.group(2)), int(dmy.group(1)))
            except ValueError:
                return None
            log.record("date_format", arrival_id, text, parsed.isoformat())
    if parsed is None:
        try:
            stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=IST)
        local = stamp.astimezone(IST)
        parsed = local.date()
        if stamp.utcoffset() != local.utcoffset():
            log.record("tz_utc", arrival_id, text, parsed.isoformat())
    if parsed > anchor:
        if parsed.day <= 12:
            swapped = date(parsed.year, parsed.day, parsed.month)
            if swapped <= anchor:
                log.record("future_swap", arrival_id, parsed.isoformat(), swapped.isoformat())
                return swapped
        return None
    return parsed


def canonical_crop(raw: str | None, arrival_id: str, log: QualityLog) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    if text in HINDI_CROPS:
        crop = HINDI_CROPS[text]
        log.record("crop_hindi", arrival_id, text, crop)
        return crop
    lowered = re.sub(r"\s+", " ", text.lower())
    crop = CROP_ALIASES.get(lowered)
    if crop is None:
        return text.title()
    if crop != text:
        log.record("crop_alias", arrival_id, raw, crop)
    return crop


def _bool(value: str | None) -> bool | None:
    if value == "True":
        return True
    if value == "False":
        return False
    return None


def inject_noise(rows: list[dict[str, str]], rate: float) -> list[dict[str, str]]:
    """Return a copy of `rows` with a deterministic share rewritten into realistic messy variants."""
    if rate <= 0:
        return rows
    rng = random.Random(42)
    noisy: list[dict[str, str]] = []
    for row in rows:
        if rng.random() >= rate:
            noisy.append(row)
            continue
        messy = dict(row)
        crop = messy.get("crop_name", "")
        for kind in rng.sample(["hindi", "roman", "kg", "label", "utc", "dmy"], k=1 if rng.random() < 0.7 else 2):
            if kind == "hindi" and crop in _HINDI_BY_CROP:
                messy["crop_name"] = rng.choice(_HINDI_BY_CROP[crop])
            elif kind == "roman" and crop in _ROMAN_BY_CROP:
                messy["crop_name"] = rng.choice(_ROMAN_BY_CROP[crop])
            elif kind in {"kg", "label"}:
                qty = _number(messy.get("arrival_quantity_qtl"))
                if qty is not None:
                    messy["arrival_quantity_qtl"] = f"{qty * 100:.0f} {rng.choice(['kg', 'KG', 'kgs'])}" if kind == "kg" else f"{qty:g} {rng.choice(['Qtl', 'quintal'])}"
            elif kind in {"utc", "dmy"}:
                try:
                    day = date.fromisoformat(messy.get("date", ""))
                except ValueError:
                    continue
                if kind == "utc":
                    local = datetime(day.year, day.month, day.day, rng.choice([0, 1, 2, 4]), rng.choice([5, 15, 40]), tzinfo=IST)
                    stamp = local.astimezone(ZoneInfo("UTC"))
                    messy["date"] = stamp.strftime("%Y-%m-%dT%H:%M:%SZ") if rng.random() < 0.5 else stamp.isoformat()
                else:
                    messy["date"] = day.strftime("%d/%m/%Y") + (rng.choice(["", " 09:30 IST", " 16:45 IST"]))
        noisy.append(messy)
    return noisy


def clean_rows(raw_rows: list[dict[str, str]]) -> tuple[list[CleanRow], dict[str, Any]]:
    anchor = date.fromisoformat(today_iso())
    rate = float(os.environ.get("MESSY_INJECT_RATE", "0.15"))
    rows = inject_noise(raw_rows, rate)
    log = QualityLog()

    district_state: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        if row.get("district") and row.get("state"):
            district_state[row["district"]][row["state"]] += 1
    district_to_state = {district: counter.most_common(1)[0][0] for district, counter in district_state.items()}

    cleaned: list[CleanRow] = []
    for index, row in enumerate(rows):
        arrival_id = row.get("arrival_id") or f"ROW{index:06d}"
        day = parse_day(row.get("date"), arrival_id, anchor, log)
        crop = canonical_crop(row.get("crop_name"), arrival_id, log)
        quantity = parse_quantity(row.get("arrival_quantity_qtl"), arrival_id, log)
        mandi = (row.get("mandi_name") or "").strip()
        if day is None or crop is None or quantity is None or not mandi:
            log.record("dropped", arrival_id, f"date={row.get('date')!r} crop={row.get('crop_name')!r} qty={row.get('arrival_quantity_qtl')!r}", "excluded")
            continue

        district = (row.get("district") or "").strip() or None
        state = (row.get("state") or "").strip() or None
        if state is None and district and district in district_to_state:
            state = district_to_state[district]
            log.record("state_inferred", arrival_id, f"district={district}, state=∅", state)

        modal = _number(row.get("modal_price"))
        msp = _number(row.get("msp"))
        below = _bool(row.get("price_below_msp"))
        if msp is None and crop in CROP_MSP and modal is not None:
            msp = CROP_MSP[crop]
            below = modal < msp
            log.record("msp_backfilled", arrival_id, f"{crop} modal ₹{modal:g}, msp=∅", f"msp ₹{msp:g} → {'below' if below else 'at/above'} MSP")
        elif msp is not None and below is None and modal is not None:
            below = modal < msp

        cleaned.append(CleanRow(
            arrival_id=arrival_id,
            day=day,
            crop=crop,
            variety=(row.get("variety") or "").strip() or None,
            mandi=mandi,
            district=district,
            state=state,
            mandi_type=(row.get("mandi_type") or "Unknown").strip(),
            quantity_qtl=quantity,
            farmer_count=_number(row.get("farmer_count")),
            area_acres=_number(row.get("total_area_acres")),
            min_price=_number(row.get("min_price")),
            max_price=_number(row.get("max_price")),
            modal_price=modal,
            msp=msp,
            below_msp=below,
            trips=_number(row.get("trips_dispatched")),
            transit_hours=_number(row.get("avg_transit_hours")),
            distance_km=_number(row.get("avg_distance_km")),
            destination=(row.get("primary_destination") or "").strip() or None,
            temp_c=_number(row.get("statewide_avg_temp_c")),
            rainfall_mm=_number(row.get("statewide_total_rainfall_mm")),
            humidity_pct=_number(row.get("statewide_avg_humidity_pct")),
        ))

    total_fixes = sum(count for rule, count in log.counts.items() if rule != "dropped")
    report = {
        "raw_rows": len(rows),
        "clean_rows": len(cleaned),
        "dropped_rows": log.counts.get("dropped", 0),
        "rows_touched": len(log.touched),
        "total_fixes": total_fixes,
        "quality_score": round((len(rows) - len(log.touched)) / len(rows) * 100, 1) if rows else 100.0,
        "anchor_date": anchor.isoformat(),
        "noise_rate_pct": round(rate * 100, 1),
        "rules": [
            {
                "rule": rule,
                "label": RULES[rule][0],
                "description": RULES[rule][1],
                "count": log.counts.get(rule, 0),
                "samples": log.samples.get(rule, []),
            }
            for rule in RULES
        ],
    }
    return cleaned, report
