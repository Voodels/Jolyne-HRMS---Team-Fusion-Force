import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, List, Optional, Set

from sqlalchemy import text

try:
    import chromadb
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
except ImportError:
    chromadb = None
    SentenceTransformerEmbeddingFunction = None


@dataclass(frozen=True)
class RagSettings:
    enabled: bool
    mode: str
    persist_dir: str
    collection: str
    embedding_model: str
    top_k: int
    score_threshold: float
    max_context_chars: int
    auto_index: bool
    index_limit: int


def _rag_debug(message: str) -> None:
    print(f"[RAG] {message}")


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y"}


def load_rag_settings() -> RagSettings:
    return RagSettings(
        enabled=_env_bool("RAG_ENABLED", True),
        mode=os.getenv("RAG_MODE", "auto").strip().lower(),
        persist_dir=os.getenv("CHROMA_PERSIST_DIR", "./chroma_db"),
        collection=os.getenv("CHROMA_COLLECTION", "candidates"),
        embedding_model=os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        top_k=int(os.getenv("RAG_TOP_K", "5")),
        score_threshold=float(os.getenv("RAG_SCORE_THRESHOLD", "0.2")),
        max_context_chars=int(os.getenv("RAG_MAX_CONTEXT_CHARS", "2000")),
        auto_index=_env_bool("RAG_AUTO_INDEX", True),
        index_limit=int(os.getenv("RAG_INDEX_LIMIT", "1000")),
    )


def init_rag_collection(settings: RagSettings) -> Optional[Any]:
    if not settings.enabled:
        return None
    if chromadb is None or SentenceTransformerEmbeddingFunction is None:
        _rag_debug("ChromaDB not installed; disabling RAG.")
        return None

    client = chromadb.PersistentClient(path=settings.persist_dir)
    embedding_fn = SentenceTransformerEmbeddingFunction(
        model_name=settings.embedding_model
    )
    collection = client.get_or_create_collection(
        name=settings.collection,
        embedding_function=embedding_fn,
    )
    _rag_debug(
        "Ready. Collection: "
        f"{settings.collection}, model: {settings.embedding_model}"
    )
    return collection


def rag_search(collection: Any, query: str, top_k: int) -> List[dict]:
    if not collection:
        return []

    _rag_debug(f"Search query received. top_k={top_k}")
    results = collection.query(query_texts=[query], n_results=top_k)
    documents = (results.get("documents") or [[]])[0] or []
    metadatas = (results.get("metadatas") or [[]])[0] or []
    distances = (results.get("distances") or [[]])[0] or []

    ids = (results.get("ids") or [[]])[0] or []
    matches = []
    for index, doc in enumerate(documents):
        meta = metadatas[index] if index < len(metadatas) else {}
        distance = distances[index] if index < len(distances) else None
        score = None
        if distance is not None:
            try:
                score = 1 - float(distance)
            except (TypeError, ValueError):
                score = None
        matches.append(
            {
                "id": ids[index] if index < len(ids) else None,
                "text": doc,
                "metadata": meta,
                "score": score,
            }
        )

    _rag_debug(f"Search complete. matches={len(matches)}")
    return matches


def filter_matches(matches: List[dict], score_threshold: float) -> List[dict]:
    if score_threshold <= 0:
        return matches
    filtered = []
    for match in matches:
        score = match.get("score")
        if score is None or score < score_threshold:
            continue
        filtered.append(match)
    _rag_debug(f"Filtered matches. before={len(matches)} after={len(filtered)}")
    return filtered


def upsert_documents(collection: Any, documents: List[dict]) -> int:
    if not collection or not documents:
        return 0

    ids = [doc["id"] for doc in documents]
    texts = [doc["text"] for doc in documents]
    metadatas = [doc.get("metadata", {}) for doc in documents]
    _rag_debug(f"Upserting {len(ids)} documents into Chroma.")
    collection.upsert(ids=ids, documents=texts, metadatas=metadatas)
    return len(ids)


def clear_collection(collection: Any) -> None:
    if not collection:
        return
    _rag_debug("Clearing Chroma collection.")
    # Chroma rejects delete(where={}); delete by explicit ids.
    batch_size = 500
    while True:
        data = collection.get(include=[], limit=batch_size)
        ids = data.get("ids") or []
        if not ids:
            break
        collection.delete(ids=ids)


def delete_candidate_by_id(collection: Any, candidate_id: str) -> int:
    if not collection or not candidate_id:
        return 0
    _rag_debug(f"Deleting candidate from Chroma. id={candidate_id}")
    collection.delete(ids=[str(candidate_id)])
    return 1


def fetch_candidate_ids_from_db(engine: Any) -> Set[str]:
    sql = text("SELECT id FROM candidates")
    with engine.begin() as connection:
        rows = connection.execute(sql).mappings().all()
    ids = {str(row["id"]) for row in rows if row.get("id") is not None}
    _rag_debug(f"Fetched {len(ids)} candidate ids from Neon.")
    return ids


def fetch_max_candidate_updated_at(engine: Any) -> Optional[datetime]:
    sql = text("SELECT MAX(updated_at) AS max_updated_at FROM candidates")
    with engine.begin() as connection:
        row = connection.execute(sql).mappings().first()
    max_updated_at = row.get("max_updated_at") if row else None
    _rag_debug(f"Max candidate updated_at={max_updated_at}")
    return max_updated_at


def get_chroma_collection_ids(collection: Any) -> Set[str]:
    if not collection:
        return set()
    result = collection.get(include=[])
    ids = result.get("ids") or []
    _rag_debug(f"Fetched {len(ids)} ids from Chroma collection.")
    return set(ids)


def reconcile_chroma_with_db(collection: Any, engine: Any) -> int:
    if not collection:
        return 0

    db_ids = fetch_candidate_ids_from_db(engine)
    chroma_ids = get_chroma_collection_ids(collection)
    orphan_ids = chroma_ids - db_ids
    if not orphan_ids:
        _rag_debug("Reconciliation complete. orphans=0")
        return 0

    orphan_list = sorted(orphan_ids)
    _rag_debug(f"Reconciliation deleting {len(orphan_list)} orphan documents.")
    collection.delete(ids=orphan_list)
    return len(orphan_list)


def filter_matches_by_db(engine: Any, matches: List[dict]) -> List[dict]:
    if not matches:
        return []

    db_ids = fetch_candidate_ids_from_db(engine)
    filtered: List[dict] = []
    for match in matches:
        candidate_id = match.get("id")
        if not candidate_id:
            meta = match.get("metadata") or {}
            candidate_id = meta.get("candidate_id") or meta.get("id")
        if candidate_id and str(candidate_id) in db_ids:
            filtered.append(match)
        else:
            _rag_debug(f"Filtered stale RAG match. id={candidate_id}")

    _rag_debug(f"DB filter applied. before={len(matches)} after={len(filtered)}")
    return filtered


def _rows_to_documents(rows: List[dict]) -> tuple[List[dict], Optional[datetime]]:
    documents: List[dict] = []
    max_updated_at: Optional[datetime] = None

    for row in rows:
        if not row:
            continue

        updated_at = row.get("updated_at")
        if updated_at and (max_updated_at is None or updated_at > max_updated_at):
            max_updated_at = updated_at

        name = row.get("full_name") or " ".join(
            part for part in [row.get("first_name"), row.get("last_name")] if part
        ).strip()
        email = row.get("email") or ""
        domain = row.get("domain") or ""
        years = row.get("total_experience_years") or row.get("years_of_experience") or ""
        job_title = row.get("current_job_title") or ""
        company = row.get("current_company") or ""
        department = row.get("department") or ""
        location = row.get("location") or ""
        skills = row.get("skills") or row.get("primary_skill") or ""
        summary = row.get("summary_text") or ""
        resume_text = row.get("resume_text") or ""

        document_text = (
            f"{summary}\n"
            f"Skills: {skills}\n"
            f"Role: {job_title} at {company}\n"
            f"Department: {department}\n"
            f"Location: {location}\n"
            f"Experience: {years}\n"
            f"Resume: {resume_text[:1500]}"
        ).strip()

        documents.append(
            {
                "id": str(row.get("id")),
                "text": document_text,
                "metadata": {
                    "name": name,
                    "email": email,
                    "domain": domain,
                    "years_experience": str(years),
                },
            }
        )
        _rag_debug(f"Prepared candidate doc id={row.get('id')} updated_at={updated_at}")

    _rag_debug(f"Built {len(documents)} documents; max_updated_at={max_updated_at}")
    return documents, max_updated_at


def build_candidate_documents(engine: Any, limit: int) -> tuple[List[dict], Optional[datetime]]:
    _rag_debug(f"Loading latest candidates for indexing. limit={limit}")
    sql = text(
        """
        SELECT
            id,
            full_name,
            first_name,
            last_name,
            email,
            domain,
            years_of_experience,
            total_experience_years,
            primary_skill,
            skills,
            summary_text,
            resume_text,
            current_job_title,
            current_company,
            department,
            location,
            updated_at
        FROM candidates
        ORDER BY updated_at DESC
        LIMIT :limit
        """
    )
    with engine.begin() as connection:
        rows = connection.execute(sql, {"limit": limit}).mappings().all()
    _rag_debug(f"Fetched {len(rows)} candidate rows for full index.")
    return _rows_to_documents(rows)


def build_candidate_documents_since(
    engine: Any,
    since: datetime,
    limit: int,
) -> tuple[List[dict], Optional[datetime]]:
    _rag_debug(f"Loading candidates updated since {since.isoformat()} (limit={limit})")
    sql = text(
        """
        SELECT
            id,
            full_name,
            first_name,
            last_name,
            email,
            domain,
            years_of_experience,
            total_experience_years,
            primary_skill,
            skills,
            summary_text,
            resume_text,
            current_job_title,
            current_company,
            department,
            location,
            updated_at
        FROM candidates
        WHERE updated_at >= :since
        ORDER BY updated_at ASC, id ASC
        LIMIT :limit
        """
    )
    with engine.begin() as connection:
        rows = connection.execute(sql, {"since": since, "limit": limit}).mappings().all()
    _rag_debug(f"Fetched {len(rows)} candidate rows for incremental sync.")
    return _rows_to_documents(rows)


def build_candidate_documents_by_id(
    engine: Any,
    candidate_id: str,
) -> tuple[List[dict], Optional[datetime]]:
    _rag_debug(f"Loading candidate by id={candidate_id}")
    sql = text(
        """
        SELECT
            id,
            full_name,
            first_name,
            last_name,
            email,
            domain,
            years_of_experience,
            total_experience_years,
            primary_skill,
            skills,
            summary_text,
            resume_text,
            current_job_title,
            current_company,
            department,
            location,
            updated_at
        FROM candidates
        WHERE id = :id
        """
    )
    with engine.begin() as connection:
        row = connection.execute(sql, {"id": candidate_id}).mappings().first()
    rows = [row] if row else []
    return _rows_to_documents(rows)


def index_candidates_from_db(
    collection: Any,
    engine: Any,
    limit: int,
) -> tuple[int, Optional[datetime]]:
    documents, max_updated_at = build_candidate_documents(engine, limit)
    count = upsert_documents(collection, documents)
    _rag_debug(f"Full index upserted {count} documents.")
    return count, max_updated_at


def index_candidates_since(
    collection: Any,
    engine: Any,
    since: datetime,
    limit: int,
) -> tuple[int, Optional[datetime]]:
    documents, max_updated_at = build_candidate_documents_since(engine, since, limit)
    count = upsert_documents(collection, documents)
    _rag_debug(f"Incremental upserted {count} documents.")
    return count, max_updated_at


def upsert_candidate_by_id(
    collection: Any,
    engine: Any,
    candidate_id: str,
) -> tuple[int, Optional[datetime]]:
    documents, max_updated_at = build_candidate_documents_by_id(engine, candidate_id)
    count = upsert_documents(collection, documents)
    _rag_debug(f"Direct upsert for id={candidate_id} count={count}")
    return count, max_updated_at


def build_rag_context(matches: List[dict], max_chars: int) -> str:
    lines: List[str] = []
    for idx, match in enumerate(matches, start=1):
        meta = match.get("metadata") or {}
        name = meta.get("name") or meta.get("full_name") or "Unknown"
        email = meta.get("email") or ""
        domain = meta.get("domain") or ""
        years = meta.get("years_experience") or ""
        score = match.get("score")
        score_str = ""
        if score is not None:
            score_str = f"score={score:.3f}"
        line = (
            f"[{idx}] {name} {email} {domain} {years} {score_str}\n"
            f"Snippet: {match.get('text', '')}"
        ).strip()
        lines.append(line)

    context = "\n\n".join(lines).strip()
    if len(context) > max_chars:
        return context[:max_chars].rstrip() + "..."
    return context


def rag_answer(model: Any, question: str, matches: List[dict], max_chars: int) -> str:
    if not matches:
        return (
            "I could not find relevant documents in the RAG index. "
            "Try a more specific query or refresh the index."
        )

    context = build_rag_context(matches, max_chars)
    prompt = (
        "You are a recruitment assistant. Answer the question using only the "
        "context below. If the context is insufficient, say so. Keep the "
        "answer short and practical.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}"
    )

    response = model.invoke([{"role": "user", "content": prompt}])
    content = getattr(response, "content", "")
    return (content or "").strip()


def combine_sql_and_rag(
    model: Any,
    question: str,
    sql_answer: str,
    matches: List[dict],
    max_chars: int,
) -> str:
    context = build_rag_context(matches, max_chars)
    prompt = (
        "You are a recruitment assistant. Combine the SQL answer and the "
        "semantic matches into one response. Use SQL data for counts and "
        "structured facts, and use RAG context for profile details. "
        "If the sources disagree, mention the conflict.\n\n"
        f"SQL answer:\n{sql_answer}\n\n"
        f"RAG context:\n{context}\n\n"
        f"Question: {question}"
    )

    response = model.invoke([{"role": "user", "content": prompt}])
    content = getattr(response, "content", "")
    return (content or "").strip()


def _json_safe_value(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, (int, float, str, bool)):
        return val
    return str(val)


def _json_safe_row(row: dict) -> dict:
    return {str(k): _json_safe_value(v) for k, v in row.items()}


def fetch_neon_candidates_preview(engine: Any, limit: int) -> tuple[int, List[dict]]:
    count_sql = text("SELECT COUNT(*) AS c FROM candidates")
    preview_sql = text(
        """
        SELECT
            id,
            full_name,
            first_name,
            last_name,
            email,
            domain,
            years_of_experience,
            total_experience_years,
            primary_skill,
            skills,
            summary_text,
            resume_text,
            current_job_title,
            current_company,
            department,
            location,
            updated_at
        FROM candidates
        ORDER BY updated_at DESC NULLS LAST, id ASC
        LIMIT :limit
        """
    )
    with engine.begin() as connection:
        total = connection.execute(count_sql).scalar() or 0
        rows = connection.execute(preview_sql, {"limit": limit}).mappings().all()
    return int(total), [_json_safe_row(dict(r)) for r in rows]


def fetch_chroma_documents_preview(
    collection: Any,
    limit: int,
    text_preview_chars: int,
) -> List[dict]:
    if not collection:
        return []
    data = collection.get(
        include=["documents", "metadatas"],
        limit=limit,
    )
    ids = data.get("ids") or []
    docs = data.get("documents") or []
    metas = data.get("metadatas") or []
    out: List[dict] = []
    for i, doc_id in enumerate(ids):
        doc_text = docs[i] if i < len(docs) else ""
        meta = metas[i] if i < len(metas) else None
        if not isinstance(meta, dict):
            meta = {}
        meta_safe = {str(k): _json_safe_value(v) for k, v in meta.items()}
        preview = (doc_text or "")[:text_preview_chars]
        if doc_text and len(doc_text) > text_preview_chars:
            preview += "…"
        out.append(
            {
                "id": str(doc_id),
                "document_preview": preview,
                "metadata": meta_safe,
            }
        )
    return out


def chroma_collection_count(collection: Any) -> int:
    if not collection:
        return 0
    try:
        return int(collection.count())
    except Exception:
        result = collection.get(include=[])
        return len(result.get("ids") or [])


def id_sync_diff_samples(
    engine: Any,
    collection: Any,
    sample: int,
) -> tuple[List[str], List[str]]:
    db_ids = fetch_candidate_ids_from_db(engine)
    chroma_ids = get_chroma_collection_ids(collection) if collection else set()
    only_db = sorted(db_ids - chroma_ids)[:sample]
    only_chroma = sorted(chroma_ids - db_ids)[:sample]
    return only_db, only_chroma
