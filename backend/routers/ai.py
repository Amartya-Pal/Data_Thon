import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from lib.db import db
from lib.dataset import build_series, get_dataset, parse_chart_intent
from models.ai import AiQueryRequest, AiStreamEvent, ChartIntent
from models.dashboard import SeriesResponse

router = APIRouter(prefix="/ai", tags=["ai"])


def _event(event_type: str, content: str | None = None, chart: SeriesResponse | None = None, intent: ChartIntent | None = None) -> str:
    return f"data: {AiStreamEvent(type=event_type, content=content, chart=chart, intent=intent).model_dump_json()}\n\n"


@router.post("/query")
async def query_dashboard_agent(request: AiQueryRequest):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI agent is not configured")

    rows, _ = await get_dataset()
    intent_dict = parse_chart_intent(request.question, rows)
    chart: SeriesResponse | None = None
    intent: ChartIntent | None = None
    if intent_dict:
        intent = ChartIntent(**intent_dict)
        chart = build_series(rows, intent.crop, intent.location, intent.location_kind, intent.days)

    now = datetime.now(timezone.utc)
    await db.ai_chat_history.insert_one({
        "session_id": request.session_id,
        "role": "user",
        "content": request.question,
        "chart_intent": intent.model_dump() if intent else None,
        "created_at": now,
    })

    context: dict = {"dashboard": request.context}
    if chart:
        context["plotted_series"] = {
            "title": chart.title,
            "window": f"{chart.start_date} to {chart.end_date}",
            "msp": chart.msp,
            "summary": chart.summary.model_dump(),
            "daily_points": [
                {"date": p.date, "qtl": p.quantity_qtl, "arrivals": p.arrivals, "modal": p.avg_modal}
                for p in chart.points if p.arrivals
            ],
        }
    context_json = json.dumps(context, ensure_ascii=False, default=str)
    system_message = (
        "You are Mandi/Pulse, a precise supply-chain analyst for a State Agriculture Board. Answer only from "
        "the supplied context (dashboard scope and, when present, the plotted_series that has ALREADY been "
        "rendered as a chart for the user). Never invent values, records, weather, or recommendations. "
        "If a chart was plotted, open with one line confirming what is on the chart, then interpret it: "
        "arrival trend, price vs MSP, and any gaps in reported prices. If the context does not answer the "
        "question, say so clearly and suggest a better dataset question. Keep answers concise: lead with the "
        "conclusion, then 2-4 short bullets of evidence. Use Indian number formatting and ₹ for prices. "
        "Quantities are in quintals (qtl)."
    )
    prompt = f"Context (JSON):\n{context_json}\n\nUser question:\n{request.question}"

    async def stream_answer():
        answer_parts: list[str] = []
        try:
            if chart:
                yield _event("chart", chart=chart, intent=intent)
            llm = LlmChat(api_key=api_key, session_id=request.session_id, system_message=system_message).with_model("openai", "gpt-5.4")
            async for event in llm.stream_message(UserMessage(text=prompt)):
                if isinstance(event, TextDelta):
                    answer_parts.append(event.content)
                    yield _event("delta", event.content)
                elif isinstance(event, StreamDone):
                    break
            answer = "".join(answer_parts).strip()
            await db.ai_chat_history.insert_one({
                "session_id": request.session_id,
                "role": "assistant",
                "content": answer,
                "created_at": datetime.now(timezone.utc),
            })
            yield _event("done")
        except Exception:
            yield _event("error", "The mandi analyst is unavailable right now. Please try again.")

    return StreamingResponse(
        stream_answer(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
