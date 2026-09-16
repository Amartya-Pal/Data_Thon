import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from lib.db import db
from models.ai import AiQueryRequest, AiStreamEvent

router = APIRouter(prefix="/ai", tags=["ai"])


def _event(event_type: str, content: str | None = None) -> str:
    return f"data: {AiStreamEvent(type=event_type, content=content).model_dump_json()}\n\n"


@router.post("/query")
async def query_dashboard_agent(request: AiQueryRequest):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI agent is not configured")

    now = datetime.now(timezone.utc)
    await db.ai_chat_history.insert_one({
        "session_id": request.session_id,
        "role": "user",
        "content": request.question,
        "created_at": now,
    })

    context_json = json.dumps(request.context, ensure_ascii=False, default=str)
    system_message = (
        "You are Field/Pulse, a precise agritech operations analyst. Answer only from the supplied "
        "dashboard context. Never invent values, records, weather, or recommendations. If the context "
        "does not answer the question, say that clearly and suggest a better dataset question. Keep answers "
        "concise: lead with the conclusion, then use short bullets for evidence. Use Indian number formatting "
        "when helpful. Mention the active filter scope when relevant."
    )
    prompt = f"Dashboard context (JSON):\n{context_json}\n\nUser question:\n{request.question}"

    async def stream_answer():
        answer_parts: list[str] = []
        try:
            chat = (
                LlmChat(
                    api_key=api_key,
                    session_id=request.session_id,
                    system_message=system_message,
                )
                .with_model("openai", "gpt-5.4")
            )
            async for event in chat.stream_message(UserMessage(text=prompt)):
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
            yield _event("error", "The field analyst is unavailable right now. Please try again.")

    return StreamingResponse(
        stream_answer(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )