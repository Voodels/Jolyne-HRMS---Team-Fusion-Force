import json
import os
import uuid
import hashlib
import time
import asyncio
from functools import lru_cache
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text, event
from sqlalchemy.pool import QueuePool

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from langchain_setup import (
    build_schema_snapshot,
    build_system_prompt,
    init_model,
    init_sql_tools,
    load_settings,
    setup_google_env,
    setup_groq_env,
    setup_langsmith_env,
    validate_settings,
)
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.messages import ToolMessage, AIMessageChunk
from langchain_core.runnables import RunnableConfig

from rag_service import (
    load_rag_settings,
    init_rag_collection,
    rag_search,
    filter_matches,
    filter_matches_by_db,
    rag_answer,
    combine_sql_and_rag,
    clear_collection,
    index_candidates_from_db,
    index_candidates_since,
    upsert_candidate_by_id,
    delete_candidate_by_id,
    reconcile_chroma_with_db,
    fetch_max_candidate_updated_at,
    fetch_neon_candidates_preview,
    fetch_chroma_documents_preview,
    chroma_collection_count,
    id_sync_diff_samples,
)


# =========================
# RESPONSE CACHING WITH TTL
# =========================
class ResponseCache:
    """TTL-based response cache for SQL queries and chat responses"""
    
    def __init__(self, ttl_seconds: int = 300, max_size: int = 100):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = Lock()
    
    def _generate_key(self, query: str, context: str = "") -> str:
        """Generate cache key from query and optional context"""
        key_str = f"{context}:{query}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def get(self, query: str, context: str = "") -> Optional[Any]:
        """Get cached response if not expired"""
        key = self._generate_key(query, context)
        with self._lock:
            if key in self._cache:
                result, timestamp = self._cache[key]
                if time.time() - timestamp < self.ttl:
                    print(f"[CACHE] Hit for key: {key[:8]}...")
                    return result
                else:
                    # Expired, remove it
                    del self._cache[key]
                    print(f"[CACHE] Expired and removed: {key[:8]}...")
        return None
    
    def set(self, query: str, result: Any, context: str = "") -> None:
        """Cache response with timestamp"""
        key = self._generate_key(query, context)
        with self._lock:
            # Evict oldest if at capacity
            if len(self._cache) >= self.max_size:
                oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
                del self._cache[oldest_key]
                print(f"[CACHE] Evicted oldest: {oldest_key[:8]}...")
            
            self._cache[key] = (result, time.time())
            print(f"[CACHE] Stored: {key[:8]}... (size: {len(self._cache)})")
    
    def clear(self) -> None:
        """Clear all cached responses"""
        with self._lock:
            self._cache.clear()
            print("[CACHE] All entries cleared")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with self._lock:
            now = time.time()
            valid_entries = sum(1 for _, ts in self._cache.values() if now - ts < self.ttl)
            expired_entries = len(self._cache) - valid_entries
            return {
                "total_entries": len(self._cache),
                "valid_entries": valid_entries,
                "expired_entries": expired_entries,
                "max_size": self.max_size,
                "ttl_seconds": self.ttl
            }


# =========================
# SCHEMA MONITORING
# =========================
class SchemaMonitor:
    """Monitor database schema for changes and auto-refresh agent"""
    
    def __init__(self, runtime: 'Runtime', check_interval_seconds: int = 60):
        self.runtime = runtime
        self.check_interval = check_interval_seconds
        self._last_schema_hash: Optional[str] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    def _compute_schema_hash(self) -> str:
        """Compute hash of current schema snapshot"""
        schema = self.runtime.schema_snapshot or ""
        return hashlib.md5(schema.encode()).hexdigest()
    
    async def _check_and_refresh(self) -> None:
        """Periodic check for schema changes"""
        while self._running:
            try:
                current_hash = self._compute_schema_hash()
                
                if self._last_schema_hash is None:
                    self._last_schema_hash = current_hash
                    print(f"[SCHEMA-MONITOR] Initial hash: {current_hash[:8]}...")
                elif current_hash != self._last_schema_hash:
                    print(f"[SCHEMA-MONITOR] Schema change detected! Refreshing agent...")
                    print(f"[SCHEMA-MONITOR] Old: {self._last_schema_hash[:8]}... -> New: {current_hash[:8]}...")
                    refresh_schema(self.runtime)
                    self._last_schema_hash = current_hash
                    # Clear response cache on schema change
                    if hasattr(self.runtime, 'response_cache'):
                        self.runtime.response_cache.clear()
                
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                print(f"[SCHEMA-MONITOR] Error: {e}")
                await asyncio.sleep(self.check_interval)
    
    def start(self) -> None:
        """Start schema monitoring"""
        if not self._running:
            self._running = True
            self._last_schema_hash = self._compute_schema_hash()
            self._task = asyncio.create_task(self._check_and_refresh())
            print(f"[SCHEMA-MONITOR] Started (interval: {self.check_interval}s)")
    
    def stop(self) -> None:
        """Stop schema monitoring"""
        self._running = False
        if self._task:
            self._task.cancel()
            print("[SCHEMA-MONITOR] Stopped")


@dataclass
class Runtime:
    model: Any
    db: Any
    tools: list
    agent: Any
    engine: Any
    run_query: Callable[[str], Any]
    settings: Any
    schema_snapshot: Optional[str] = None
    response_cache: Optional[ResponseCache] = None
    schema_monitor: Optional[SchemaMonitor] = None
    rag_settings: Optional[Any] = None
    rag_collection: Optional[Any] = None
    rag_last_synced_at: Optional[datetime] = None
    rag_sync_task: Optional[asyncio.Task] = None


class StartResponse(BaseModel):
    session_id: str


class ChatMessageIn(BaseModel):
    session_id: Optional[str] = None
    message: str = Field(min_length=1)


class PendingActionOut(BaseModel):
    id: str
    tool_name: str
    tool_args: dict
    description: Optional[str] = None


class ChatMessageOut(BaseModel):
    session_id: str
    thinking_preview: Optional[str] = None
    pending_action: Optional[PendingActionOut] = None
    assistant_message: Optional[str] = None


class ApproveIn(BaseModel):
    action_id: str
    decision: str


class HistoryMessage(BaseModel):
    role: str
    content: str
    created_at: str


class HistoryOut(BaseModel):
    session_id: str
    messages: list[HistoryMessage]


class RefreshSchemaOut(BaseModel):
    schema_cached: bool
    table_count: int
    auto_refresh_enabled: bool = True


class RagSearchIn(BaseModel):
    query: str = Field(min_length=1)
    top_k: Optional[int] = None


class RagSearchOut(BaseModel):
    query: str
    count: int
    results: list[dict]


class RagIndexIn(BaseModel):
    limit: Optional[int] = None
    rebuild: bool = False


class RagIndexOut(BaseModel):
    indexed: int
    limit: int
    rebuilt: bool


class RagUpsertIn(BaseModel):
    candidate_id: str = Field(min_length=1)


class RagUpsertOut(BaseModel):
    upserted: int
    last_synced_at: Optional[str] = None


class RagDeleteIn(BaseModel):
    candidate_id: str = Field(min_length=1)


class RagDeleteOut(BaseModel):
    deleted: int


class DataSourcesInspectOut(BaseModel):
    neon_total: int
    neon_sample: List[Dict[str, Any]]
    chroma_enabled: bool
    chroma_collection_name: Optional[str] = None
    chroma_total: int
    chroma_sample: List[Dict[str, Any]]
    neon_ids_missing_in_chroma_sample: List[str]
    chroma_ids_missing_in_neon_sample: List[str]


class CacheStatsOut(BaseModel):
    enabled: bool
    total_entries: int
    valid_entries: int
    expired_entries: int
    max_size: int
    ttl_seconds: int
    hit_rate: Optional[float] = None


class StreamingChunk(BaseModel):
    type: str  # "thinking", "content", "action", "done"
    data: Any
    session_id: str


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUNTIME: Optional[Runtime] = None


def create_schema(engine) -> None:
    print("[DEBUG] Initializing database schema...")
    statements = [
        """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id UUID PRIMARY KEY,
            session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS pending_actions (
            id UUID PRIMARY KEY,
            session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            tool_name TEXT NOT NULL,
            tool_args JSONB NOT NULL,
            user_text TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_session(engine, session_id: Optional[str]) -> str:
    if session_id:
        with engine.begin() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM chat_sessions WHERE id = :id"),
                {"id": session_id},
            ).fetchone()
        if exists:
            print(f"[DEBUG] Found existing session: {session_id}")
            return session_id

    new_session = str(uuid.uuid4())
    print(f"[DEBUG] Creating new session: {new_session}")
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO chat_sessions (id) VALUES (:id)"),
            {"id": new_session},
        )
    return new_session


def save_message(engine, session_id: str, role: str, content: str) -> None:
    print(f"[DEBUG] Saving {role} message to session {session_id}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO chat_messages (id, session_id, role, content)
                VALUES (:id, :session_id, :role, :content)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "role": role,
                "content": content,
            },
        )


def save_pending_action(
    engine,
    session_id: str,
    tool_name: str,
    tool_args: dict,
    user_text: str,
) -> str:
    action_id = str(uuid.uuid4())
    print(f"[DEBUG] Saving pending action {action_id} for tool {tool_name}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO pending_actions (id, session_id, tool_name, tool_args, user_text)
                VALUES (:id, :session_id, :tool_name, CAST(:tool_args AS jsonb), :user_text)
                """
            ),
            {
                "id": action_id,
                "session_id": session_id,
                "tool_name": tool_name,
                "tool_args": json.dumps(tool_args),
                "user_text": user_text,
            },
        )
    return action_id


def get_pending_action(engine, action_id: str) -> dict:
    with engine.begin() as connection:
        row = connection.execute(
            text(
                """
                SELECT id, session_id, tool_name, tool_args, user_text, status
                FROM pending_actions
                WHERE id = :id
                """
            ),
            {"id": action_id},
        ).fetchone()

    if not row:
        print(f"[DEBUG] Pending action {action_id} not found in DB!")
        raise HTTPException(status_code=404, detail="Pending action not found")

    tool_args = row.tool_args
    if isinstance(tool_args, str):
        tool_args = json.loads(tool_args)

    return {
        "id": row.id,
        "session_id": row.session_id,
        "tool_name": row.tool_name,
        "tool_args": tool_args,
        "user_text": row.user_text,
        "status": row.status,
    }


def update_pending_status(engine, action_id: str, status: str) -> None:
    print(f"[DEBUG] Updating pending action {action_id} status to: {status}")
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE pending_actions SET status = :status WHERE id = :id"),
            {"status": status, "id": action_id},
        )


def build_reflection_prompt(user_text: str) -> str:
    return (
        "Provide a short processing note (max 140 characters). "
        "Keep it high-level and neutral, do not include hidden reasoning steps. "
        f"User question: {user_text}"
    )


def is_read_only_sql(query: str) -> bool:
    if not query: return False
    stripped = query.strip().lstrip("(").strip()
    prefix = stripped[:10].lower()
    is_safe = prefix.startswith("select") or prefix.startswith("with")
    print(f"[DEBUG] SQL Read-Only Check: {is_safe} for query: {query[:50]}...")
    return is_safe


def _looks_like_sql_question(message: str) -> bool:
    msg = message.lower()
    strong_sql_hints = [
        "count",
        "average",
        "sum",
        "total",
        "group by",
        "order by",
        "top",
        "list",
        "show all",
        "how many",
        "number of",
        "between",
        "before",
        "after",
    ]
    return any(hint in msg for hint in strong_sql_hints)


def _get_rag_matches(runtime: Runtime, message: str) -> list[dict]:
    if not runtime.rag_collection or not runtime.rag_settings:
        return []
    matches = rag_search(runtime.rag_collection, message, runtime.rag_settings.top_k)
    matches = filter_matches(matches, runtime.rag_settings.score_threshold)
    return filter_matches_by_db(runtime.engine, matches)


def _decide_route(runtime: Runtime, message: str) -> tuple[str, list[dict]]:
    settings = runtime.rag_settings
    if not settings or not runtime.rag_collection or not settings.enabled:
        return "sql", []

    mode = settings.mode
    if mode in {"sql", "rag", "hybrid"}:
        matches = _get_rag_matches(runtime, message) if mode != "sql" else []
        return mode, matches

    if _looks_like_sql_question(message):
        return "sql", []

    matches = _get_rag_matches(runtime, message)
    if matches:
        return "rag", matches
    return "sql", []


async def rag_sync_loop(runtime: Runtime) -> None:
    interval = int(os.getenv("RAG_SYNC_INTERVAL_SECONDS", "30"))
    limit = int(os.getenv("RAG_SYNC_LIMIT", "500"))
    print(f"[RAG] Sync loop started. interval={interval}s limit={limit}")

    while True:
        try:
            if not runtime.rag_collection or not runtime.rag_settings or not runtime.rag_settings.enabled:
                await asyncio.sleep(interval)
                continue

            since = runtime.rag_last_synced_at or datetime.now(timezone.utc)
            print(f"[RAG] Sync tick. since={since.isoformat()} limit={limit}")

            indexed, max_updated_at = index_candidates_since(
                runtime.rag_collection,
                runtime.engine,
                since,
                limit,
            )
            print(f"[RAG] Sync upserted {indexed} documents.")
            if max_updated_at:
                runtime.rag_last_synced_at = max_updated_at
                print(f"[RAG] last_synced_at updated to {max_updated_at.isoformat()}")

            deleted = reconcile_chroma_with_db(runtime.rag_collection, runtime.engine)
            if deleted:
                print(f"[RAG] Sync reconciliation removed {deleted} orphan documents.")
        except Exception as exc:
            print(f"[RAG] Sync loop error: {exc}")

        await asyncio.sleep(interval)


def init_agent_runtime() -> Runtime:
    print("[DEBUG] Initializing Agent Runtime...")
    if load_dotenv:
        load_dotenv()

    settings = load_settings()
    validate_settings(settings)
    setup_langsmith_env(settings)
    setup_google_env(settings)
    setup_groq_env(settings)

    model = init_model(settings)
    db, tools = init_sql_tools(settings.database_url, model)
    schema_snapshot = None
    if settings.schema_cache:
        schema_snapshot = build_schema_snapshot(db, settings.schema_cache_table_limit)
        print("[DEBUG] Schema snapshot generated and cached.")

    system_prompt = build_system_prompt(db.dialect, top_k=5, schema_snapshot=schema_snapshot)
    
    print("[DEBUG] Compiling LangGraph ReAct agent...")
    agent = create_react_agent(
        model,
        tools,
        prompt=system_prompt,
        checkpointer=InMemorySaver(),
        interrupt_before=["tools"],
    )

    # Enhanced database connection pooling
    engine = create_engine(
        settings.database_url,
        poolclass=QueuePool,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
        pool_timeout=30
    )
    create_schema(engine)
    print("[DEBUG] Database connection pool created (size: 10, max_overflow: 20)")

    # Initialize response cache (5 min TTL, 100 max entries)
    response_cache = ResponseCache(ttl_seconds=300, max_size=100)
    print("[DEBUG] Response cache initialized (TTL: 300s, max: 100)")

    if settings.sql_query_cache_size > 0:
        print(f"[DEBUG] Query caching enabled (size: {settings.sql_query_cache_size})")
        @lru_cache(maxsize=settings.sql_query_cache_size)
        def cached_run(query: str) -> Any:
            return db.run(query)
        run_query = cached_run
    else:
        run_query = db.run

    runtime = Runtime(
        model=model,
        db=db,
        tools=tools,
        agent=agent,
        engine=engine,
        run_query=run_query,
        settings=settings,
        schema_snapshot=schema_snapshot,
        response_cache=response_cache,
    )
    
    # Initialize and start schema auto-monitor
    schema_monitor = SchemaMonitor(runtime, check_interval_seconds=60)
    runtime.schema_monitor = schema_monitor
    schema_monitor.start()

    # Initialize RAG resources (optional)
    rag_settings = load_rag_settings()
    rag_collection = init_rag_collection(rag_settings)
    runtime.rag_settings = rag_settings
    runtime.rag_collection = rag_collection
    runtime.rag_last_synced_at = (
        fetch_max_candidate_updated_at(runtime.engine)
        or datetime.fromtimestamp(0, tz=timezone.utc)
    )
    print(
        "[RAG] last_synced_at initialized to "
        f"{runtime.rag_last_synced_at.isoformat()}"
    )

    if rag_settings.enabled and rag_settings.auto_index and rag_collection:
        try:
            indexed, max_updated_at = index_candidates_from_db(
                rag_collection,
                runtime.engine,
                rag_settings.index_limit,
            )
            runtime.rag_last_synced_at = (
                max_updated_at
                or fetch_max_candidate_updated_at(runtime.engine)
                or datetime.fromtimestamp(0, tz=timezone.utc)
            )
            print(
                "[RAG] last_synced_at updated to "
                f"{runtime.rag_last_synced_at.isoformat()}"
            )
            deleted = reconcile_chroma_with_db(rag_collection, runtime.engine)
            if deleted:
                print(f"[RAG] Startup reconciliation removed {deleted} orphan documents.")
            print(f"[RAG] Auto-indexed {indexed} candidates.")
        except Exception as exc:
            print(f"[RAG] Auto-index failed: {exc}")

    if rag_settings.enabled and rag_collection:
        runtime.rag_sync_task = asyncio.create_task(rag_sync_loop(runtime))
        print("[RAG] Background sync task started.")
    
    return runtime


def refresh_schema(runtime: Runtime) -> None:
    print("[DEBUG] Refreshing schema manually...")
    schema_snapshot = None
    if runtime.settings.schema_cache:
        schema_snapshot = build_schema_snapshot(
            runtime.db,
            runtime.settings.schema_cache_table_limit,
        )

    system_prompt = build_system_prompt(
        runtime.db.dialect,
        top_k=5,
        schema_snapshot=schema_snapshot,
    )
    
    runtime.agent = create_react_agent(
        runtime.model,
        runtime.tools,
        prompt=system_prompt,
        checkpointer=InMemorySaver(),
        interrupt_before=["tools"],
    )
    runtime.schema_snapshot = schema_snapshot


@app.on_event("startup")
def startup() -> None:
    global RUNTIME
    print("[DEBUG] [chat-api] Starting up server...")
    RUNTIME = init_agent_runtime()
    print("[DEBUG] [chat-api] Server runtime ready.")


@app.on_event("shutdown")
def shutdown() -> None:
    global RUNTIME
    print("[DEBUG] [chat-api] Shutting down server...")
    if RUNTIME and RUNTIME.schema_monitor:
        RUNTIME.schema_monitor.stop()
        print("[DEBUG] [chat-api] Schema monitor stopped.")
    if RUNTIME and RUNTIME.rag_sync_task:
        RUNTIME.rag_sync_task.cancel()
        print("[RAG] Background sync task stopped.")
    print("[DEBUG] [chat-api] Server shutdown complete.")


@app.post("/chat/start", response_model=StartResponse)
def start_chat() -> StartResponse:
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")
    session_id = ensure_session(RUNTIME.engine, None)
    return StartResponse(session_id=session_id)


@app.post("/chat/refresh-schema", response_model=RefreshSchemaOut)
def refresh_schema_endpoint() -> RefreshSchemaOut:
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    refresh_schema(RUNTIME)
    table_count = len(RUNTIME.db.get_usable_table_names())
    return RefreshSchemaOut(
        schema_cached=bool(RUNTIME.schema_snapshot),
        table_count=table_count,
        auto_refresh_enabled=RUNTIME.schema_monitor is not None and RUNTIME.schema_monitor._running,
    )


@app.post("/rag/search", response_model=RagSearchOut)
def rag_search_endpoint(payload: RagSearchIn) -> RagSearchOut:
    if not RUNTIME or not RUNTIME.rag_settings or not RUNTIME.rag_collection:
        raise HTTPException(status_code=503, detail="RAG not initialized")
    if not RUNTIME.rag_settings.enabled:
        raise HTTPException(status_code=400, detail="RAG is disabled")

    top_k = payload.top_k or RUNTIME.rag_settings.top_k
    print(f"[RAG] /rag/search query received. top_k={top_k}")
    matches = rag_search(RUNTIME.rag_collection, payload.query, top_k)
    matches = filter_matches(matches, RUNTIME.rag_settings.score_threshold)
    matches = filter_matches_by_db(RUNTIME.engine, matches)

    return RagSearchOut(
        query=payload.query,
        count=len(matches),
        results=matches,
    )


@app.post("/rag/reindex", response_model=RagIndexOut)
def rag_reindex_endpoint(payload: RagIndexIn) -> RagIndexOut:
    if not RUNTIME or not RUNTIME.rag_settings or not RUNTIME.rag_collection:
        raise HTTPException(status_code=503, detail="RAG not initialized")
    if not RUNTIME.rag_settings.enabled:
        raise HTTPException(status_code=400, detail="RAG is disabled")

    limit = payload.limit or RUNTIME.rag_settings.index_limit
    print(f"[RAG] /rag/reindex requested. limit={limit} rebuild={payload.rebuild}")
    if payload.rebuild:
        clear_collection(RUNTIME.rag_collection)
    indexed, max_updated_at = index_candidates_from_db(
        RUNTIME.rag_collection,
        RUNTIME.engine,
        limit,
    )
    if max_updated_at:
        RUNTIME.rag_last_synced_at = max_updated_at
        print(f"[RAG] last_synced_at updated to {max_updated_at.isoformat()}")
    return RagIndexOut(indexed=indexed, limit=limit, rebuilt=payload.rebuild)


@app.post("/rag/upsert", response_model=RagUpsertOut)
def rag_upsert_endpoint(payload: RagUpsertIn) -> RagUpsertOut:
    if not RUNTIME or not RUNTIME.rag_settings or not RUNTIME.rag_collection:
        raise HTTPException(status_code=503, detail="RAG not initialized")
    if not RUNTIME.rag_settings.enabled:
        raise HTTPException(status_code=400, detail="RAG is disabled")

    print(f"[RAG] /rag/upsert requested. candidate_id={payload.candidate_id}")
    indexed, max_updated_at = upsert_candidate_by_id(
        RUNTIME.rag_collection,
        RUNTIME.engine,
        payload.candidate_id,
    )
    if indexed == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if max_updated_at:
        RUNTIME.rag_last_synced_at = max_updated_at
        print(f"[RAG] last_synced_at updated to {max_updated_at.isoformat()}")
    return RagUpsertOut(
        upserted=indexed,
        last_synced_at=RUNTIME.rag_last_synced_at.isoformat() if RUNTIME.rag_last_synced_at else None,
    )


@app.post("/rag/delete", response_model=RagDeleteOut)
def rag_delete_endpoint(payload: RagDeleteIn) -> RagDeleteOut:
    if not RUNTIME or not RUNTIME.rag_settings or not RUNTIME.rag_collection:
        raise HTTPException(status_code=503, detail="RAG not initialized")
    if not RUNTIME.rag_settings.enabled:
        raise HTTPException(status_code=400, detail="RAG is disabled")

    print(f"[RAG] /rag/delete requested. candidate_id={payload.candidate_id}")
    deleted = delete_candidate_by_id(RUNTIME.rag_collection, payload.candidate_id)
    return RagDeleteOut(deleted=deleted)


@app.get("/chat/cache-stats", response_model=CacheStatsOut)
def get_cache_stats() -> CacheStatsOut:
    """Get response cache statistics"""
    if not RUNTIME or not RUNTIME.response_cache:
        return CacheStatsOut(
            enabled=False,
            total_entries=0,
            valid_entries=0,
            expired_entries=0,
            max_size=0,
            ttl_seconds=0,
        )
    
    stats = RUNTIME.response_cache.stats()
    return CacheStatsOut(
        enabled=True,
        **stats
    )


@app.post("/chat/clear-cache")
def clear_cache() -> dict:
    """Clear the response cache"""
    if not RUNTIME or not RUNTIME.response_cache:
        return {"message": "Cache not initialized", "cleared": False}
    
    RUNTIME.response_cache.clear()
    return {"message": "Cache cleared successfully", "cleared": True}


async def stream_chat_response(payload: ChatMessageIn):
    """Stream chat response with real-time updates"""
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    session_id = ensure_session(RUNTIME.engine, payload.session_id)
    save_message(RUNTIME.engine, session_id, "user", payload.message)

    route, rag_matches = _decide_route(RUNTIME, payload.message)
    if route == "rag":
        if RUNTIME.settings.enable_thinking_preview:
            yield f"data: {json.dumps({'type': 'thinking', 'data': 'Routing to RAG pipeline', 'session_id': session_id})}\n\n"
        assistant_message = rag_answer(
            RUNTIME.model,
            payload.message,
            rag_matches,
            RUNTIME.rag_settings.max_context_chars if RUNTIME.rag_settings else 2000,
        )
        save_message(RUNTIME.engine, session_id, "assistant", assistant_message)
        yield f"data: {json.dumps({'type': 'content', 'data': assistant_message, 'session_id': session_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'data': None, 'session_id': session_id})}\n\n"
        return
    
    # Send initial ping to establish connection
    yield f"data: {json.dumps({'type': 'ping', 'data': 'connected', 'session_id': session_id})}\n\n"
    
    # Check cache first
    cache_key = f"{session_id}:{payload.message}"
    cached_response = RUNTIME.response_cache.get(payload.message, cache_key) if RUNTIME.response_cache else None
    
    if cached_response:
        # Return cached response as single chunk
        yield f"data: {json.dumps({'type': 'thinking', 'data': 'Cached response', 'session_id': session_id})}\n\n"
        await asyncio.sleep(0.1)
        yield f"data: {json.dumps({'type': 'content', 'data': cached_response, 'session_id': session_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'data': None, 'session_id': session_id})}\n\n"
        return
    
    # Generate thinking preview
    thinking_preview = None
    if RUNTIME.settings.enable_thinking_preview:
        try:
            reflection_prompt = build_reflection_prompt(payload.message)
            reflection = RUNTIME.model.invoke([{"role": "user", "content": reflection_prompt}])
            thinking_preview = getattr(reflection, "content", "")
            yield f"data: {json.dumps({'type': 'thinking', 'data': thinking_preview, 'session_id': session_id})}\n\n"
        except Exception as e:
            print(f"[STREAM] Thinking preview error: {e}")
    
    config = {"configurable": {"thread_id": session_id}}
    input_data = {"messages": [{"role": "user", "content": payload.message}]}
    
    assistant_message = ""
    pending_action = None
    error_occurred = None
    
    try:
        while True:
            for step in RUNTIME.agent.stream(input_data, config, stream_mode="values"):
                if "messages" in step:
                    msg = step["messages"][-1]
                    # Only stream AI messages (not human/tool messages)
                    if hasattr(msg, 'type') and msg.type == 'ai' and hasattr(msg, 'content') and msg.content:
                        # Stream content chunks
                        content_chunk = msg.content
                        assistant_message += content_chunk
                        yield f"data: {json.dumps({'type': 'content', 'data': content_chunk, 'session_id': session_id})}\n\n"
                        await asyncio.sleep(0.02)  # Small delay for smooth streaming
            
            input_data = None
            state = RUNTIME.agent.get_state(config)
            
            if not state.next:
                if state.values.get("messages"):
                    final_content = state.values["messages"][-1].content
                    # Cache the final response
                    if RUNTIME.response_cache:
                        RUNTIME.response_cache.set(payload.message, final_content, cache_key)
                break
            
            if state.next[0] == "tools":
                last_message = state.values["messages"][-1]
                if not last_message.tool_calls:
                    break
                
                tool_call = last_message.tool_calls[0]
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                
                if tool_name != "sql_db_query" or is_read_only_sql(tool_args.get("query", "")):
                    yield f"data: {json.dumps({'type': 'action', 'data': f'Auto-approving: {tool_name}', 'session_id': session_id})}\n\n"
                    continue
                
                # Pending action - stream it
                pending_action = {
                    "tool_name": tool_name,
                    "tool_args": tool_args,
                    "description": f"Pending approval for {tool_name}",
                }
                yield f"data: {json.dumps({'type': 'action', 'data': pending_action, 'session_id': session_id})}\n\n"
                break
                
    except Exception as e:
        error_occurred = str(e)
        print(f"[STREAM] Error during streaming: {e}")
        yield f"data: {json.dumps({'type': 'error', 'data': error_occurred, 'session_id': session_id})}\n\n"
    finally:
        # Always send done event
        yield f"data: {json.dumps({'type': 'done', 'data': pending_action or error_occurred, 'session_id': session_id})}\n\n"


@app.post("/chat/message-stream")
def send_message_stream(payload: ChatMessageIn):
    """Streaming endpoint for chat messages"""
    return StreamingResponse(
        stream_chat_response(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        }
    )


@app.post("/chat/message", response_model=ChatMessageOut)
def send_message(payload: ChatMessageIn) -> ChatMessageOut:
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    session_id = ensure_session(RUNTIME.engine, payload.session_id)
    print(f"[DEBUG] Incoming user message for session: {session_id}")
    save_message(RUNTIME.engine, session_id, "user", payload.message)

    route, rag_matches = _decide_route(RUNTIME, payload.message)
    print(f"[DEBUG] Route decision: {route}")

    thinking_preview = None
    if RUNTIME.settings.enable_thinking_preview and route == "sql":
        print("[DEBUG] Generating thinking preview...")
        reflection_prompt = build_reflection_prompt(payload.message)
        reflection = RUNTIME.model.invoke([{"role": "user", "content": reflection_prompt}])
        thinking_preview = getattr(reflection, "content", "")
    elif RUNTIME.settings.enable_thinking_preview and route in {"rag", "hybrid"}:
        thinking_preview = f"Routing to {route.upper()} pipeline"

    if route == "rag":
        assistant_message = rag_answer(
            RUNTIME.model,
            payload.message,
            rag_matches,
            RUNTIME.rag_settings.max_context_chars if RUNTIME.rag_settings else 2000,
        )
        save_message(RUNTIME.engine, session_id, "assistant", assistant_message)
        return ChatMessageOut(
            session_id=session_id,
            thinking_preview=thinking_preview,
            assistant_message=assistant_message,
        )

    config = {"configurable": {"thread_id": session_id}}
    pending_action = None
    assistant_message = None

    # We use input_data for the first iteration, and None for resuming if we auto-approve a safe tool
    input_data = {"messages": [{"role": "user", "content": payload.message}]}

    while True:
        print("[DEBUG] Entering LangGraph stream loop...")
        for step in RUNTIME.agent.stream(input_data, config, stream_mode="values"):
            if "messages" in step:
                msg = step["messages"][-1]
                print(f"[DEBUG] Graph emitted message: {msg.type} - {str(msg.content)[:100]}")

        # Clear input_data so subsequent loops resume the graph properly
        input_data = None
        
        # Check the state of the graph to see if it is paused
        state = RUNTIME.agent.get_state(config)
        
        if not state.next:
            print("[DEBUG] Graph execution finished naturally.")
            if state.values.get("messages"):
                assistant_message = state.values["messages"][-1].content
            break

        if state.next[0] == "tools":
            last_message = state.values["messages"][-1]
            if not last_message.tool_calls:
                break
            
            tool_call = last_message.tool_calls[0]
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            
            print(f"[DEBUG] Graph interrupted before tool: {tool_name}")
            print(f"[DEBUG] Tool args: {tool_args}")

            # Safe tools or Read-only SQL queries are auto-approved to keep conversation fluid
            if tool_name != "sql_db_query" or is_read_only_sql(tool_args.get("query", "")):
                print(f"[DEBUG] Auto-approving safe tool: {tool_name}")
                continue # Loops back and resumes the graph automatically

            # Destructive SQL requires manual approval
            print(f"[DEBUG] HALTING: Destructive or complex SQL detected. User approval required.")
            pending_action = {
                "tool_name": tool_name,
                "tool_args": tool_args,
                "description": f"Pending approval for {tool_name}",
            }
            break

    if pending_action:
        action_id = save_pending_action(
            RUNTIME.engine,
            session_id,
            pending_action["tool_name"],
            pending_action["tool_args"],
            payload.message,
        )
        return ChatMessageOut(
            session_id=session_id,
            thinking_preview=thinking_preview,
            pending_action=PendingActionOut(
                id=action_id,
                tool_name=pending_action["tool_name"],
                tool_args=pending_action["tool_args"],
                description=pending_action.get("description"),
            ),
        )

    if assistant_message and route == "hybrid":
        if not rag_matches:
            rag_matches = _get_rag_matches(RUNTIME, payload.message)
        if rag_matches:
            assistant_message = combine_sql_and_rag(
                RUNTIME.model,
                payload.message,
                assistant_message,
                rag_matches,
                RUNTIME.rag_settings.max_context_chars if RUNTIME.rag_settings else 2000,
            )

    if assistant_message:
        save_message(RUNTIME.engine, session_id, "assistant", assistant_message)

    return ChatMessageOut(
        session_id=session_id,
        thinking_preview=thinking_preview,
        assistant_message=assistant_message,
    )


@app.post("/chat/approve", response_model=ChatMessageOut)
def approve_action(payload: ApproveIn) -> ChatMessageOut:
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    action = get_pending_action(RUNTIME.engine, payload.action_id)
    print(f"[DEBUG] Processing approval for action {payload.action_id}. Decision: {payload.decision}")
    
    if action["status"] != "pending":
        print("[DEBUG] Error: Action was already processed.")
        raise HTTPException(status_code=400, detail="Action already processed")

    decision = payload.decision.lower().strip()
    if decision not in {"approve", "deny"}:
        raise HTTPException(status_code=400, detail="Decision must be approve or deny")

    config = {"configurable": {"thread_id": str(action["session_id"])}}

    if decision == "deny":
        print("[DEBUG] User denied the tool execution.")
        update_pending_status(RUNTIME.engine, action["id"], "denied")
        
        # Inject a denial message directly into the graph state so the LLM knows it was rejected
        state = RUNTIME.agent.get_state(config)
        last_message = state.values["messages"][-1]
        tool_call_id = last_message.tool_calls[0]["id"]
        
        print(f"[DEBUG] Updating LangGraph state with ToolMessage rejection for {tool_call_id}")
        RUNTIME.agent.update_state(
            config,
            {"messages": [ToolMessage(tool_call_id=tool_call_id, content="User denied the request.", name=action["tool_name"])]},
            as_node="tools" # Apply this update exactly where it is paused
        )
        
        # Resume the graph to let the LLM react to the denial
        final_message = "Request denied."
        for step in RUNTIME.agent.stream(None, config, stream_mode="values"):
            if "messages" in step:
                final_message = step["messages"][-1].content
                
        save_message(RUNTIME.engine, action["session_id"], "assistant", final_message)
        return ChatMessageOut(
            session_id=action["session_id"],
            assistant_message=final_message,
        )

    # If Approved
    print("[DEBUG] User approved the tool execution. Resuming LangGraph...")
    try:
        final_message = ""
        # Passing None as input to stream() resumes execution from the breakpoint
        for step in RUNTIME.agent.stream(None, config, stream_mode="values"):
            if "messages" in step:
                final_message = step["messages"][-1].content
                print(f"[DEBUG] Graph post-execution message: {str(final_message)[:100]}")
                
        update_pending_status(RUNTIME.engine, action["id"], "approved")
        save_message(RUNTIME.engine, action["session_id"], "assistant", final_message)
        
        return ChatMessageOut(
            session_id=str(action["session_id"]),
            assistant_message=final_message,
        )
        
    except Exception as exc:
        print(f"[DEBUG] Fatal error during tool execution: {exc}")
        update_pending_status(RUNTIME.engine, action["id"], "error")
        raise HTTPException(status_code=500, detail=f"SQL execution failed: {exc}") from exc


@app.get("/chat/history/{session_id}", response_model=HistoryOut)
def get_history(session_id: str) -> HistoryOut:
    print(f"[DEBUG] Fetching history for session {session_id}")
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    with RUNTIME.engine.begin() as connection:
        rows = connection.execute(
            text(
                """
                SELECT role, content, created_at
                FROM chat_messages
                WHERE session_id = :session_id
                ORDER BY created_at
                """
            ),
            {"session_id": session_id},
        ).all()

    messages = [
        HistoryMessage(
            role=row.role,
            content=row.content,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]

    return HistoryOut(session_id=session_id, messages=messages)


@app.get("/health")
def health_check():
    """Health check with performance metrics"""
    if not RUNTIME:
        return {
            "status": "unhealthy",
            "runtime": "not initialized"
        }
    
    cache_stats = RUNTIME.response_cache.stats() if RUNTIME.response_cache else None
    
    # Get session count from database
    with RUNTIME.engine.begin() as connection:
        session_count = connection.execute(
            text("SELECT COUNT(*) FROM chat_sessions")
        ).scalar()
        message_count = connection.execute(
            text("SELECT COUNT(*) FROM chat_messages")
        ).scalar()
    
    return {
        "status": "healthy",
        "features": {
            "response_caching": cache_stats is not None,
            "auto_schema_refresh": RUNTIME.schema_monitor is not None and RUNTIME.schema_monitor._running,
            "streaming": True,
            "connection_pooling": True,
            "rag": bool(RUNTIME.rag_collection is not None and RUNTIME.rag_settings and RUNTIME.rag_settings.enabled)
        },
        "performance": {
            "cache": cache_stats,
            "pool_size": 10,
            "max_overflow": 20
        },
        "stats": {
            "active_sessions": session_count or 0,
            "total_messages": message_count or 0,
            "table_count": len(RUNTIME.db.get_usable_table_names()) if RUNTIME.db else 0,
            "rag_mode": RUNTIME.rag_settings.mode if RUNTIME.rag_settings else "disabled",
            "rag_last_synced_at": RUNTIME.rag_last_synced_at.isoformat() if RUNTIME.rag_last_synced_at else None
        }
    }


@app.get("/debug/data-sources", response_model=DataSourcesInspectOut)
def debug_data_sources(
    limit: int = 50,
    text_preview_chars: int = 400,
    diff_sample: int = 30,
) -> DataSourcesInspectOut:
    """Neon (Postgres) candidates vs Chroma RAG index — for local verification."""
    if not RUNTIME:
        raise HTTPException(status_code=500, detail="Runtime not initialized")

    lim = max(1, min(limit, 500))
    tprev = max(80, min(text_preview_chars, 4000))
    dsample = max(0, min(diff_sample, 200))

    neon_total, neon_sample = fetch_neon_candidates_preview(RUNTIME.engine, lim)

    coll = RUNTIME.rag_collection
    settings = RUNTIME.rag_settings
    chroma_enabled = bool(settings and settings.enabled and coll is not None)
    cname = settings.collection if settings else None

    chroma_sample: List[Dict[str, Any]] = []
    chroma_total = 0
    missing_neon: List[str] = []
    missing_chroma: List[str] = []

    if coll is not None:
        chroma_total = chroma_collection_count(coll)
        chroma_sample = fetch_chroma_documents_preview(coll, lim, tprev)
        if dsample > 0:
            missing_neon, missing_chroma = id_sync_diff_samples(
                RUNTIME.engine, coll, dsample
            )

    return DataSourcesInspectOut(
        neon_total=neon_total,
        neon_sample=neon_sample,
        chroma_enabled=chroma_enabled,
        chroma_collection_name=cname,
        chroma_total=chroma_total,
        chroma_sample=chroma_sample,
        neon_ids_missing_in_chroma_sample=missing_neon,
        chroma_ids_missing_in_neon_sample=missing_chroma,
    )


@app.get("/")
def root():
    return {
        "service": "SQL Agent Chat API",
        "version": "2.0",
        "features": [
            "Response Caching (TTL-based)",
            "Auto Schema Refresh",
            "Streaming Responses",
            "Connection Pooling",
            "Session Persistence (PostgreSQL)"
        ],
        "endpoints": [
            "/chat/start",
            "/chat/message",
            "/chat/message-stream",
            "/chat/approve",
            "/chat/history/{session_id}",
            "/chat/refresh-schema",
            "/chat/cache-stats",
            "/chat/clear-cache",
            "/rag/search",
            "/rag/reindex",
            "/rag/upsert",
            "/rag/delete",
            "/health",
            "/debug/data-sources",
        ]
    }