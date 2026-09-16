# Mandi/Pulse — Mandi-to-Market Supply Chain Optimizer (Track 3 · AgriTech)

## Purpose
A light-mode (projector-friendly) dashboard for a State Agriculture Board: daily crop arrivals at mandis, modal prices tracked against MSP, weather correlated with logistics risk, and an AI analyst that answers questions and plots charts on demand. The source is the "messy" combined agritech CSV (`DATASET_URL` in `backend/.env`).

## Data pipeline (`backend/lib/cleaning.py`, `backend/lib/dataset.py`)
The CSV is fetched once, then `clean_rows()` normalises every row into a typed `CleanRow` and logs each fix for the Data Quality panel:
- **Synthetic noise** (deterministic, seed 42, `MESSY_INJECT_RATE` default 0.15): Hindi crop names (गेहूं, सरसों, धान…), romanized/casing variants (Gehu, KAPAS), kg/quintal-labelled quantities, UTC ISO timestamps, `DD/MM/YYYY [HH:MM IST]` dates.
- **Real source defects**: 318 rows dated Oct–Dec 2026 beyond today (pod clock, `lib/dates.today_iso`) → month/day swapped back; 1,642 rows missing state → inferred from district; MSP missing → backfilled per crop (`CROP_MSP`) with below-MSP flag derived from modal price.
- Rules: crop_hindi, crop_alias, unit_convert, unit_label, tz_utc, date_format, future_swap, state_inferred, msp_backfilled, dropped.
- "Amritsar mandi" maps to **Amritsar district** (no mandi carries that name).

## API (all on `/api`)
- `GET /dashboard/summary?crop&state&district&mandi&date_from&date_to` → metrics, 10-day trend, crop mix, mandi leaderboard, destinations, latest arrivals, `msp_watch` (per-crop modal vs MSP), `data_quality` report, filter options.
- `GET /dashboard/series?crop&mandi|district|state&days=3..365` → daily points (quantity, arrivals, avg modal, 7-day rolling modal, MSP) anchored to the data horizon (min(dataset max date, today)). 404 for unknown crop.
- `POST /ai/query` (SSE) → events `chart` (when the question parses as a plot intent: trigger words + crop/location/`last N days`), `delta`, `done`, `error`. Uses Emergent LLM key with `gpt-5.4`; chat turns persist in Mongo `ai_chat_history`.
- Files: `GET /files`, `POST /files` (multipart: file, category, label; ≤15 MB; images/pdf/csv/xlsx/docx/txt/json), `GET /files/{id}/content`, `DELETE /files/{id}`. Stored on local disk `backend/uploads/` (gitignored), metadata in Mongo `media_files`. 415 on bad type, 404 on missing id.

## Frontend (`frontend/src`)
- `pages/Home.tsx` composes: hero, filters (crop/state/district/mandi/date range), 5 metric cards, network flow + crop mix, **MSP tracker** (crop chips, 30/60/90d) + **MSP watch**, mandi leaderboard + destinations, recent arrivals + weather context, **weather alerts** (editable rainfall/humidity thresholds) + **AI agent** (renders live chart from `chart` events; bonus query preset "Plot the daily arrival trend of Wheat in Amritsar mandi vs MSP for the last 30 days"), **Data quality** (score ring, rule list, before→after samples), **Evidence locker** (drag-drop upload, thumbnails, open/delete).
- `lib/types.ts` mirrors every Pydantic model; `lib/api.ts` has `apiUpload` (multipart) and `apiPostStream` (SSE).
- Theme: light warm paper, deep green primary, amber prices, terracotta MSP line, blue rainfall. Fonts: Manrope (headings), IBM Plex Sans, JetBrains Mono.

## Auth
None. No credentials required.
