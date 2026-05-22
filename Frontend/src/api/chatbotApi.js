const BASE_URL =
  process.env.REACT_APP_CHAT_API_BASE_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:8000";

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
};

export const startSession = async () => {
  const res = await fetch(`${BASE_URL}/chat/start`, {
    method: "POST",
  });
  return handleResponse(res);
};

export const sendMessage = async ({ sessionId, message }) => {
  const res = await fetch(`${BASE_URL}/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse(res);
};

export const approveAction = async ({ actionId, decision }) => {
  const res = await fetch(`${BASE_URL}/chat/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_id: actionId, decision }),
  });
  return handleResponse(res);
};

export const getHistory = async (sessionId) => {
  const res = await fetch(`${BASE_URL}/chat/history/${sessionId}`);
  return handleResponse(res);
};

export const refreshSchema = async () => {
  const res = await fetch(`${BASE_URL}/chat/refresh-schema`, {
    method: "POST",
  });
  return handleResponse(res);
};

/** Neon `candidates` vs Chroma RAG index (SQL-Agent). */
export const fetchDataSourcesInspect = async ({ limit = 50 } = {}) => {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${BASE_URL}/debug/data-sources?${params}`);
  return handleResponse(res);
};
