import json
import os
import shlex
import subprocess
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field


GEMINI_CLI_PATH = os.getenv("GEMINI_CLI_PATH", "gemini")
GEMINI_CLI_TIMEOUT = int(os.getenv("GEMINI_CLI_TIMEOUT", "120"))
GEMINI_CLI_OUTPUT_FORMAT = os.getenv("GEMINI_CLI_OUTPUT_FORMAT", "text")
GEMINI_CLI_DEFAULT_MODEL = os.getenv("GEMINI_CLI_MODEL", "gemini-cli")
GEMINI_CLI_EXTRA_ARGS = os.getenv("GEMINI_CLI_EXTRA_ARGS", "")


app = FastAPI()


class ChatMessage(BaseModel):
    role: str
    content: Any


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = Field(default=None, alias="max_tokens")
    stream: Optional[bool] = False


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    owned_by: str = "gemini-cli"


class ModelsResponse(BaseModel):
    object: str = "list"
    data: List[ModelInfo]


def _normalize_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(p for p in parts if p)
    if isinstance(content, dict) and "text" in content:
        return str(content.get("text", ""))
    return str(content)


def _build_prompt(messages: List[ChatMessage]) -> str:
    user_messages = [msg for msg in messages if msg.role == "user"]
    if user_messages:
        return _normalize_content(user_messages[-1].content).strip()
    if messages:
        return _normalize_content(messages[-1].content).strip()
    return ""


def _extract_text_from_json(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("text", "content", "output", "message", "response"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        candidates = payload.get("candidates")
        if isinstance(candidates, list) and candidates:
            candidate = candidates[0]
            if isinstance(candidate, dict):
                for key in ("text", "content", "output", "message"):
                    value = candidate.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
                content = candidate.get("content")
                if isinstance(content, dict):
                    parts = content.get("parts")
                    if isinstance(parts, list):
                        texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
                        merged = "".join(texts).strip()
                        if merged:
                            return merged
    if isinstance(payload, list) and payload:
        return _extract_text_from_json(payload[0])
    return ""


def _run_gemini(prompt: str, model: Optional[str], output_format: str) -> str:
    cmd = [GEMINI_CLI_PATH]
    if model and model not in {"gemini-cli", "default", "auto"}:
        cmd += ["--model", model]
    cmd += ["--output-format", output_format]
    cmd += ["--prompt", ""]
    if GEMINI_CLI_EXTRA_ARGS:
        cmd += shlex.split(GEMINI_CLI_EXTRA_ARGS)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            input=prompt,
            timeout=GEMINI_CLI_TIMEOUT,
            check=False,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=f"Gemini CLI not found: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Gemini CLI timed out") from exc

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise HTTPException(status_code=500, detail=f"Gemini CLI error: {detail}")

    output = result.stdout.strip()
    if output_format == "json":
        try:
            payload = json.loads(output)
            extracted = _extract_text_from_json(payload)
            return extracted or output
        except json.JSONDecodeError:
            return output
    return output


def _openai_response(text: str, model: str) -> Dict[str, Any]:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def _stream_chunks(text: str, model: str) -> Iterable[str]:
    chunk_size = 200
    for i in range(0, len(text), chunk_size):
        chunk = text[i : i + chunk_size]
        payload = {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {"content": chunk},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(payload)}\n\n"

    final_payload = {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop",
            }
        ],
    }
    yield f"data: {json.dumps(final_payload)}\n\n"
    yield "data: [DONE]\n\n"


@app.get("/v1/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/models", response_model=ModelsResponse)
def list_models() -> ModelsResponse:
    model_id = GEMINI_CLI_DEFAULT_MODEL
    return ModelsResponse(data=[ModelInfo(id=model_id)])


@app.post("/v1/chat/completions")
def chat_completions(request: ChatCompletionRequest):
    model = request.model or GEMINI_CLI_DEFAULT_MODEL
    prompt = _build_prompt(request.messages)
    output_format = GEMINI_CLI_OUTPUT_FORMAT

    text = _run_gemini(prompt, model, output_format)
    if not text:
        raise HTTPException(status_code=500, detail="Gemini CLI returned empty output")

    if request.stream:
        return StreamingResponse(_stream_chunks(text, model), media_type="text/event-stream")

    return JSONResponse(_openai_response(text, model))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
