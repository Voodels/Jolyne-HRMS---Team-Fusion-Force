import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import Loader from '../Loader/Loader';
import { useState, useEffect } from 'react';
import { getJobTitles } from '../../api/jobApi';
import './Pipeline.css';

// ✅ ENV
const BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Pipeline() {
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('All Jobs');
  const [stageFilter, setStageFilter] = useState('All Stages');
  const [jobOptions, setJobOptions] = useState(['All Jobs']);

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // ---------------- FETCH FROM API ----------------
  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/candidates`);
      if (!res.ok) {
        throw new Error('Failed to fetch candidates');
      }
      const data = await res.json();

      const list = Array.isArray(data) ? data : data.content || [];

      const formatted = list.map((c) => ({
        id: c.id,
        name: c.fullName,
        role: c.department,
        stage: formatStage(c.currentStage),
        skills: c.skills,
        lastActivity: c.updatedAt?.split('T')[0],
        score: Math.floor(Math.random() * 30) + 70, // dummy score (optional)
      }));

      setCandidates(formatted);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  // Fetch job titles for dropdown
  useEffect(() => {
    const fetchJobTitles = async () => {
      try {
        const titles = await getJobTitles();
        setJobOptions(['All Jobs', ...titles]);
      } catch (err) {
        console.error('Failed to load job titles', err);
        setJobOptions(['All Jobs']);
      }
    };

    fetchJobTitles();
  }, []);

  // ---------------- STAGE FORMAT ----------------
  const formatStage = (stage) => {
    switch (stage) {
      case 'APPLIED': return 'Applied';
      case 'SCREENING': return 'Screening';
      case 'TECH_INTERVIEW': return 'Shortlisted'; // mapped
      case 'HR_INTERVIEW': return 'Shortlisted';
      case 'SELECTED': return 'Selected';
      case 'REJECTED': return 'Rejected';
      default: return stage;
    }
  };

  // ---------------- FILTER ----------------
  const filteredCandidates = candidates.filter((c) => {
    return (
      (jobFilter === 'All Jobs' || c.role === jobFilter) &&
      (stageFilter === 'All Stages' || c.stage === stageFilter) &&
      (
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.skills || '').toLowerCase().includes(search.toLowerCase())
      )
    );
  });

  // ---------------- GROUP ----------------
  const grouped = {
    Applied: filteredCandidates.filter(c => c.stage === 'Applied'),
    Shortlisted: filteredCandidates.filter(
      c => c.stage === 'Shortlisted' || c.stage === 'Screening'
    ),
    Selected: filteredCandidates.filter(c => c.stage === 'Selected'),
  };

  // ---------------- CARD ----------------
  const renderColumn = (title, list) => (
    <div className="pipeline-column">
      <h3 className="column-title">{title}</h3>

      <div className="column-cards">
        {list.map((c) => (
          <div
            key={c.id}
            className="candidate-card"
            onClick={() => navigate(`/candidates/${c.id}`, { state: { from: 'pipeline' } })}
          >
            <div className="card-avatar">
              {c.name.split(' ').map(n => n[0]).join('')}
            </div>

            <div className="card-info">
              <h4>{c.name}</h4>
              <p>{c.role}</p>
            </div>

            <div className="card-score">{c.score}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ---------------- UI ----------------
  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />

      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} />

        <main className="pipeline-main">
          <div className="pipeline-header">
            <h2 className="pipeline-title">Hiring Pipeline</h2>

            <div className="pipeline-header-right">
              <div className="search-box">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
                {jobOptions.map(job => (
                  <option key={job} value={job}>{job}</option>
                ))}
              </select>

              <select onChange={(e) => setStageFilter(e.target.value)}>
                <option>All Stages</option>
                <option>Applied</option>
                <option>Shortlisted</option>
                <option>Selected</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="pipeline-loader">
              <Loader label="Loading pipeline..." />
            </div>
          ) : (
            <div className="pipeline-container">
              {renderColumn('Applied', grouped.Applied)}
              {renderColumn('Shortlisted', grouped.Shortlisted)}
              {renderColumn('Selected', grouped.Selected)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Pipeline;