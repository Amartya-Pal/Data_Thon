# Agritech Command Center

## Purpose
An all-in-one agritech operations dashboard backed by the uploaded combined agritech CSV. It presents market arrivals, crop mix, mandi performance, logistics destinations, pricing vs MSP, and climate signals.

## Data model
The source rows include date, crop, variety, arrival quantity, farmer count, mandi, district/state, price fields, MSP comparison, dispatch/logistics, and statewide weather fields. The backend fetches the public CSV once and aggregates it in memory for `/api/dashboard/summary`.

## Key flows
- Open `/` to see the full dashboard shell and current aggregate metrics.
- Change crop, state, mandi, or date range filters to request and redraw the filtered view.
- Use Refresh to revalidate the dataset summary and Reset filters to return to the full range.

## Auth and integrations
No authentication. No third-party user integration. DATASET_URL is the uploaded public CSV source configured in `backend/.env`.