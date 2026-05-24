// const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

const handleResponse = async (res) => {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message || body?.error || res.statusText || 'Authentication request failed';
    throw new Error(message);
  }
  return body;
};

export const login = async ({ email, password }) => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
};

export const createUser = async ({ name, email, password, role, createdByEmail, createdByPassword }) => {
  const res = await fetch(`${BASE_URL}/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role, createdByEmail, createdByPassword }),
  });
  return handleResponse(res);
};

export const getUsers = async () => {
  const res = await fetch(`${BASE_URL}/auth/users`);
  return handleResponse(res);
};

export const updateUser = async ({ id, name, email, password, role, requesterEmail, requesterPassword }) => {
  const res = await fetch(`${BASE_URL}/auth/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role, requesterEmail, requesterPassword }),
  });
  return handleResponse(res);
};

export const deleteUser = async ({ id, requesterEmail, requesterPassword }) => {
  const res = await fetch(`${BASE_URL}/auth/users/${id}?requesterEmail=${encodeURIComponent(requesterEmail)}&requesterPassword=${encodeURIComponent(requesterPassword)}`, {
    method: 'DELETE',
  });
  return handleResponse(res);
};

export const verifyOtp = async ({ email, otp }) => {
  const res = await fetch(`${BASE_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  return handleResponse(res);
};

export const getAuthSession = () => {
  try {
    return JSON.parse(localStorage.getItem('authSession') || 'null');
  } catch (error) {
    return null;
  }
};

export const setAuthSession = (session) => {
  localStorage.setItem('authSession', JSON.stringify(session));
};

export const clearAuthSession = () => {
  localStorage.removeItem('authSession');
};
