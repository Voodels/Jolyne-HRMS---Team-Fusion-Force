// const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const BASE_URL = process.env.REACT_APP_API_BASE_URL;

export const getJobs = async () => {
  const res = await fetch(`${BASE_URL}/jobs`);
  if (!res.ok) {
    throw new Error('Failed to load jobs');
  }
  return res.json();
};

export const createJob = async (job) => {
  const res = await fetch(`${BASE_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to create job');
  }
  return res.json();
};

export const deleteJob = async (id) => {
  const res = await fetch(`${BASE_URL}/jobs/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to delete job');
  }
};

export const getJobTitles = async () => {
  try {
    const jobs = await getJobs();
    return jobs.map(job => job.title);
  } catch (err) {
    console.error('Failed to get job titles', err);
    return [];
  }
};
