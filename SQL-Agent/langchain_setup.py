import os
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import create_engine

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError
    from langchain_groq import ChatGroq
    from langchain_ollama import ChatOllama
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage
    from langchain_postgres import PostgresChatMessageHistory
    from langchain_community.utilities import SQLDatabase
    from langchain_community.agent_toolkits import SQLDatabaseToolkit
    from langgraph.prebuilt import create_react_agent
    from langgraph.checkpoint.memory import InMemorySaver
    import psycopg
except ImportError as exc:
    raise SystemExit(
        "Missing optional packages. Install with: "
        "pip install langchain langgraph langchain-community \"langchain[google-genai]\" "
        "langchain-openai langchain-postgres langchain-ollama sqlalchemy psycopg2-binary psycopg"
    ) from exc


@dataclass(frozen=True)
class Settings:
    model_provider: str
    ollama_model: str
    ollama_base_url: Optional[str]
    groq_model: str
    gemini_model: str
    openai_model: str
    openai_base_url: Optional[str]
    openai_api_key: Optional[str]
    langsmith_api_key: Optional[str]
    google_api_key: Optional[str]
    groq_api_key: Optional[str]
    database_url: Optional[str]
    session_id: str
    enable_thinking_preview: bool
    schema_cache: bool
    schema_cache_table_limit: int
    sql_query_cache_size: int


def load_settings() -> Settings:
    print("[DEBUG] Loading environment settings...")
    session_id = os.getenv("SESSION_ID")
    if not session_id:
        session_id = str(uuid.uuid4())
        print(f"[DEBUG] No SESSION_ID found. Generated new UUID: {session_id}")
    
    return Settings(
        model_provider=os.getenv("MODEL_PROVIDER", "ollama").strip().lower(),
        ollama_model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL"),
        groq_model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        openai_model=os.getenv("OPENAI_MODEL", "gemini-cli"),
        openai_base_url=os.getenv("OPENAI_BASE_URL"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        langsmith_api_key=os.getenv("LANGSMITH_API_KEY"),
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        database_url=os.getenv("NEON_DATABASE_URL"),
        session_id=session_id,
        enable_thinking_preview=os.getenv("ENABLE_THINKING_PREVIEW", "0").strip().lower() in {"1", "true", "yes"},
        schema_cache=os.getenv("SCHEMA_CACHE", "1").strip().lower() in {"1", "true", "yes"},
        schema_cache_table_limit=int(os.getenv("SCHEMA_CACHE_TABLE_LIMIT", "50")),
        sql_query_cache_size=int(os.getenv("SQL_QUERY_CACHE_SIZE", "0")),
    )


def validate_settings(settings: Settings) -> None:
    print("[DEBUG] Validating configuration dependencies...")
    missing = []
    if settings.model_provider == "gemini" and not settings.google_api_key:
        missing.append("GOOGLE_API_KEY")
    if settings.model_provider == "groq" and not settings.groq_api_key:
        missing.append("GROQ_API_KEY")
    if settings.model_provider == "openai_compat" and not settings.openai_base_url:
        missing.append("OPENAI_BASE_URL")
    if not settings.database_url:
        missing.append("NEON_DATABASE_URL")
    if missing:
        missing_list = ", ".join(missing)
        print(f"[DEBUG] ERROR: Missing variables: {missing_list}")
        raise SystemExit(f"Missing required environment variables: {missing_list}")
    print(f"[DEBUG] Provider configured as: {settings.model_provider.upper()}")


def setup_langsmith_env(settings: Settings) -> None:
    print("[DEBUG] LangSmith tracing is currently disabled.")
    return


def setup_google_env(settings: Settings) -> None:
    if settings.google_api_key:
        os.environ["GOOGLE_API_KEY"] = settings.google_api_key


def setup_groq_env(settings: Settings) -> None:
    if settings.groq_api_key:
        os.environ["GROQ_API_KEY"] = settings.groq_api_key


def init_model(settings: Settings) -> Any:
    print(f"[DEBUG] Initializing LLM for provider: {settings.model_provider}")
    if settings.model_provider == "ollama":
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0,
        )
    if settings.model_provider == "groq":
        return ChatGroq(model=settings.groq_model, temperature=0)
    if settings.model_provider == "openai_compat":
        api_key = settings.openai_api_key or "local-key"
        return ChatOpenAI(
            model=settings.openai_model,
            base_url=settings.openai_base_url,
            api_key=api_key,
            temperature=0,
        )
    return ChatGoogleGenerativeAI(model=settings.gemini_model, temperature=0)


def test_model(model: Any, settings: Settings) -> None:
    print("[DEBUG] Sending test ping to LLM...")
    try:
        response = model.invoke([HumanMessage(content="say hello world")])
    except ChatGoogleGenerativeAIError as exc:
        raise SystemExit(f"Gemini API error: {exc}") from exc
    except Exception as exc:
        provider = "Ollama" if settings.model_provider == "ollama" else "model"
        raise SystemExit(f"{provider} error: {exc}") from exc
    print(f"[DEBUG] LLM Response: {response.content.strip()}")


def init_sql_tools(database_url: str, model: Any) -> tuple[SQLDatabase, list]:
    print("[DEBUG] Binding SQL tools to database...")
    db = SQLDatabase.from_uri(database_url)
    toolkit = SQLDatabaseToolkit(db=db, llm=model)
    return db, toolkit.get_tools()


def build_system_prompt(
    dialect: str,
    top_k: int = 5,
    schema_snapshot: Optional[str] = None,
) -> str:
    print("[DEBUG] Building system prompt...")
    prompt = (
        "You are an agent designed to interact with a SQL database.\n"
        "Given an input question, create a syntactically correct "
        f"{dialect} query to run,\n"
        "then look at the results of the query and return the answer. Unless the user\n"
        "specifies a specific number of examples they wish to obtain, always limit your\n"
        f"query to at most {top_k} results.\n\n"
        "You can order the results by a relevant column to return the most interesting\n"
        "examples in the database. Never query for all the columns from a specific table,\n"
        "only ask for the relevant columns given the question.\n\n"
        "You MUST double check your query before executing it. If you get an error while\n"
        "executing a query, rewrite the query and try again.\n\n"
        "DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the\n"
        "database.\n\n"
        "If a schema snapshot is provided below, use it directly and avoid calling\n"
        "sql_db_list_tables or sql_db_schema unless the user asks to refresh the schema.\n"
    )
    if schema_snapshot:
        prompt += "\nSchema snapshot (may be cached):\n" + schema_snapshot.strip() + "\n"
    else:
        prompt += (
            "\nTo start you should ALWAYS look at the tables in the database to see what you\n"
            "can query. Do NOT skip this step.\n\n"
            "Then you should query the schema of the most relevant tables.\n"
            "When calling sql_db_schema, pass exactly one table name.\n"
        )
    return prompt


def build_schema_snapshot(db: SQLDatabase, table_limit: int) -> str:
    print("[DEBUG] Building schema snapshot cache...")
    table_names = db.get_usable_table_names()
    omitted = 0
    if table_limit > 0 and len(table_names) > table_limit:
        omitted = len(table_names) - table_limit
        table_names = table_names[:table_limit]
    table_list = ", ".join(table_names)
    table_info = db.get_table_info(table_names)
    if omitted:
        table_list += f" (and {omitted} more)"
    return f"Tables: {table_list}\n\n{table_info}"


def init_agent(model: Any, db: SQLDatabase, tools: list):
    print("[DEBUG] Initializing LangGraph ReAct Agent...")
    system_prompt = build_system_prompt(db.dialect, top_k=5)
    return create_react_agent(
        model,
        tools,
        prompt=system_prompt,
        checkpointer=InMemorySaver(),
        interrupt_before=["tools"], # Pause before tool execution for HITL
    )


def run_agent(agent) -> None:
    print("\n[DEBUG] --- STARTING AGENT SIMULATION ---")
    question = "What skills does Rahul have?"
    print(f"[DEBUG] Test Question: '{question}'")
    
    config = {"configurable": {"thread_id": "test_session_1"}}

    # Phase 1: Stream until the agent decides to use a tool (and pauses)
    print("[DEBUG] Streaming agent generation...")
    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        config,
        stream_mode="values",
    ):
        if "messages" in step:
            last_msg = step["messages"][-1]
            print(f"[DEBUG] [Message Type: {last_msg.type}]: {str(last_msg.content)[:100]}")

    # Phase 2: Check if the graph is paused
    state = agent.get_state(config)
    if state.next and state.next[0] == "tools":
        print("\n[DEBUG] >> INTERRUPTED: Agent paused before tool execution.")
        last_message = state.values["messages"][-1]
        
        if last_message.tool_calls:
            for tc in last_message.tool_calls:
                print(f"[DEBUG] >> Pending Tool: {tc['name']}")
                print(f"[DEBUG] >> Tool Args: {tc['args']}")

        print("\n[DEBUG] Simulating human approval... resuming graph execution.")
        # Phase 3: Resume execution by passing None into stream
        for step in agent.stream(None, config, stream_mode="values"):
            if "messages" in step:
                last_msg = step["messages"][-1]
                print(f"[DEBUG] [Message Type: {last_msg.type}]: {str(last_msg.content)[:100]}")
                
    print("[DEBUG] --- AGENT SIMULATION COMPLETE ---\n")


def init_postgres_history(
    database_url: str,
    session_id: str,
) -> tuple[PostgresChatMessageHistory, "psycopg.Connection"]:
    print(f"[DEBUG] Initializing PostgresChatMessageHistory for session: {session_id}")
    # Removed the wasted SQLAlchemy engine creation here
    connection = psycopg.connect(database_url)
    history = PostgresChatMessageHistory(
        "message_store",
        session_id,
        sync_connection=connection,
    )
    return history, connection


def test_postgres_history(history: PostgresChatMessageHistory) -> None:
    print("[DEBUG] Testing Chat History read/write capabilities...")
    history.add_user_message("Hello, how are you?")
    history.add_ai_message("I am doing well, thank you!")

    print("[DEBUG] Messages retrieved from Database:")
    for msg in history.messages:
        print(f"  > {msg.type.capitalize()}: {msg.content}")


def main() -> None:
    print("[DEBUG] Script Started.")
    if load_dotenv:
        print("[DEBUG] Loading .env file.")
        load_dotenv()
    else:
        print("[DEBUG] python-dotenv not installed; .env file will be ignored.")

    settings = load_settings()
    validate_settings(settings)

    setup_langsmith_env(settings)
    setup_google_env(settings)
    setup_groq_env(settings)

    model = init_model(settings)
    test_model(model, settings)

    db, tools = init_sql_tools(settings.database_url, model)
    
    print("\n[DEBUG] Loaded Tools:")
    for tool in tools:
        print(f"  - {tool.name}: {str(tool.description)[:80]}...")

    agent = init_agent(model, db, tools)
    run_agent(agent)

    history, connection = init_postgres_history(settings.database_url, settings.session_id)
    try:
        test_postgres_history(history)
    finally:
        print("[DEBUG] Closing psycopg database connection.")
        connection.close()


if __name__ == "__main__":
    main()