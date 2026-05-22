import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import AddCandidateModal from '../AddCandidateModal/AddCandidateModal';
<<<<<<< HEAD
import { getJobTitles } from '../../api/jobApi';
=======
import Loader from '../Loader/Loader';
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd
import './Candidates.css';

// ✅ ENV BASE URL
// const BASE_URL = import.meta.env.VITE_API_BASE_URL;
// For CRA use:
const BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Candidates() {
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [candidates, setCandidates] = useState([]);
<<<<<<< HEAD
  const [jobTitles, setJobTitles] = useState([]);
=======
  const [loading, setLoading] = useState(true);
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd

  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('All Jobs');
  const [stageFilter, setStageFilter] = useState('All Stages');
  const [sortBy, setSortBy] = useState('Latest');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [editCandidate, setEditCandidate] = useState(null);

  // ---------------- Sidebar ----------------
  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // ---------------- Notifications ----------------
  const addNotification = (text) => {
    const newNotif = {
      id: Date.now(),
      text,
      time: 'Just now',
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // ---------------- Stage Helpers ----------------
  const formatStage = (stage) => {
    switch (stage) {
      case 'TECH_INTERVIEW': return 'Tech Interview';
      case 'APPLIED': return 'Applied';
      case 'SHORTLISTED': return 'Shortlisted';
      case 'SELECTED': return 'Selected';
      default: return stage;
    }
  };

  const getStageColor = (stage) => {
    switch (stage) {
      case 'TECH_INTERVIEW':
        return { bg: '#dbeafe', text: '#1d4ed8' };
      case 'APPLIED':
        return { bg: '#e0e7ff', text: '#4338ca' };
      case 'SHORTLISTED':
        return { bg: '#fef3c7', text: '#d97706' };
      case 'SELECTED':
        return { bg: '#dcfce7', text: '#16a34a' };
      default:
        return { bg: '#f3f4f6', text: '#374151' };
    }
  };

  // ---------------- FETCH ALL ----------------
 const fetchCandidates = async () => {
  try {
    setLoading(true);
    const res = await fetch(`${BASE_URL}/candidates`);

    if (!res.ok) {
      throw new Error('Failed to fetch candidates');
    }

    const data = await res.json();

    // ✅ Handle ALL cases
    const list = Array.isArray(data)
      ? data
      : data.content || [];   // pagination support

    const formatted = list.map((c) => ({
      id: c.id,
      initials: c.firstName?.charAt(0) || '',
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      jobTitle: c.department,
      stage: formatStage(c.currentStage),
      stageColor: getStageColor(c.currentStage).bg,
      stageTextColor: getStageColor(c.currentStage).text,
      skills: c.skills,
      lastActivity: c.updatedAt?.split('T')[0],
    }));

    setCandidates(formatted);
  } catch (err) {
    console.error("FETCH ERROR:", err);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchCandidates();
    fetchJobTitles();
  }, []);

  const fetchJobTitles = async () => {
    try {
      const titles = await getJobTitles();
      setJobTitles(titles);
    } catch (err) {
      console.error('Failed to load job titles', err);
    }
  };

  // ---------------- SEARCH ----------------
  const handleSearch = async (value) => {
  setSearch(value);

  if (!value) {
    fetchCandidates();
    return;
  }

  try {
    setLoading(true);
    const res = await fetch(`${BASE_URL}/candidates/search?name=${value}`);

    if (!res.ok) {
      throw new Error('Failed to search candidates');
    }

    const data = await res.json();

    const list = Array.isArray(data)
      ? data
      : data.content || [];

    const formatted = list.map((c) => ({
      id: c.id,
      initials: c.firstName?.charAt(0) || '',
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      jobTitle: c.department,
      stage: formatStage(c.currentStage),
      stageColor: getStageColor(c.currentStage).bg,
      stageTextColor: getStageColor(c.currentStage).text,
      skills: c.skills,
      lastActivity: c.updatedAt?.split('T')[0],
    }));

    setCandidates(formatted);
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const clearNotifications = () => {
  setNotifications([]);
};

  // ---------------- DELETE ----------------
  const handleDelete = async (id) => {
    try {
      await fetch(`${BASE_URL}/candidates/${id}`, {
        method: 'DELETE',
      });

      fetchCandidates();

      const candidate = candidates.find(c => c.id === id);
      addNotification(`Candidate ${candidate?.name} deleted`);
    } catch (err) {
      console.error(err);
    }

    setActiveMenuId(null);
  };

  // ---------------- VIEW ----------------
  const handleView = (id) => {
    navigate(`/candidates/${id}`, { state: { from: 'candidates' } });
  };

  // ---------------- EDIT ----------------
  const handleEdit = async (c) => {
  try {
    const res = await fetch(`${BASE_URL}/candidates/${c.id}`);
    const data = await res.json();

    setEditCandidate(data);
    setIsModalOpen(true);

  } catch (err) {
    console.error(err);
  }

  setActiveMenuId(null);
};

  // ---------------- FILTER ----------------
  let filtered = candidates.filter((c) =>
    (jobFilter === 'All Jobs' || c.jobTitle === jobFilter) &&
    (stageFilter === 'All Stages' || c.stage === stageFilter) &&
    (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.skills || '').toLowerCase().includes(search.toLowerCase())
    )
  );

  // ---------------- SORT ----------------
  if (sortBy === 'Name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'Oldest') {
    filtered.sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));
  } else {
    filtered.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  // ---------------- UI ----------------
  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />

      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} notifications={notifications} clearNotifications={clearNotifications} />

        <main className="candidates-main">

          <div className="candidates-header">
            <h2 className="candidates-title">Candidates</h2>

            <div className="candidates-header-right">

              <div className="candidates-filters">
                <select className="filter-select" onChange={(e) => setJobFilter(e.target.value)}>
                  <option>All Jobs</option>
                  {jobTitles.map((title) => (
                    <option key={title}>{title}</option>
                  ))}
                </select>

                <select className="filter-select" onChange={(e) => setStageFilter(e.target.value)}>
                  <option>All Stages</option>
                  <option>Applied</option>
                  <option>Shortlisted</option>
                  <option>Tech Interview</option>
                  <option>Selected</option>
                </select>

                <select className="filter-select" onChange={(e) => setSortBy(e.target.value)}>
                  <option value="Latest">Sort: Latest</option>
                  <option value="Oldest">Sort: Oldest</option>
                  <option value="Name">Sort: Name</option>
                </select>
              </div>

              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              <button className="btn-add-candidate" onClick={() => setIsModalOpen(true)}>
                + Add Candidate
              </button>
            </div>
          </div>

          {loading ? (
            <div className="candidates-loader">
              <Loader label="Loading candidates..." />
            </div>
          ) : (
            <div className="candidates-table-wrap">
              <table className="candidates-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Job Title</th>
                    <th>Stage</th>
                    <th>Skills</th>
                    <th>Last Activity</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="candidate-row">
                      <td onClick={() => handleView(c.id)}>
                        <div className="candidate-name-cell">
                          <div className="candidate-avatar">{c.initials}</div>
                          <div>
                            <p className="candidate-name">{c.name}</p>
                            <p className="candidate-email">{c.email}</p>
                          </div>
                        </div>
                      </td>

                      <td>{c.jobTitle}</td>

                      <td>
                        <span
                          className="stage-badge"
                          style={{
                            background: c.stageColor,
                            color: c.stageTextColor,
                          }}
                        >
                          {c.stage}
                        </span>
                      </td>

                      <td>{c.skills}</td>
                      <td>{c.lastActivity}</td>

                      <td style={{ position: 'relative' }}>
                        <button
                          className="more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(prev => prev === c.id ? null : c.id);
                          }}
                        >
                          ⋮
                        </button>

                        {activeMenuId === c.id && (
                          <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            <div className="dropdown-header">
                              <span>Actions</span>
                              <button
                                className="dropdown-close"
                                onClick={() => setActiveMenuId(null)}
                              >
                                ✖
                              </button>
                            </div>

                            <div className="dropdown-item" onClick={() => handleView(c.id)}>👁 View</div>
                            <div className="dropdown-item" onClick={() => handleEdit(c)}>✏ Edit</div>
                            <div className="dropdown-item delete" onClick={() => handleDelete(c.id)}>🗑 Delete</div>
                          </div>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="no-data">No candidates found</p>
          )}
        </main>
      </div>

      <AddCandidateModal
  isOpen={isModalOpen}
  onClose={() => {
    setIsModalOpen(false);
    setEditCandidate(null); // reset
  }}
  onAdd={fetchCandidates}
  editData={editCandidate}
/>
    </div>
  );
}

export default Candidates;