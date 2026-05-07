// const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

export const getDashboardData = async (rangeDays = 30) => {
  const res = await fetch(`${BASE_URL}/dashboard?rangeDays=${rangeDays}`);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to load dashboard data');
  }
  return res.json();
};
