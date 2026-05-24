import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom'; // ✅ ADDED useLocation
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import Loader from '../Loader/Loader';
import './CandidateProfile.css';

// ✅ ENV
const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const tabs = ['Overview', 'Resume', 'AI Analysis', 'Notes'];

// ✅ Correct backend stages
const stages = [
  { label: 'Applied', value: 'APPLIED' },
  { label: 'Screening', value: 'SCREENING' },
  { label: 'Tech Interview', value: 'TECH_INTERVIEW' },
  { label: 'HR Interview', value: 'HR_INTERVIEW' },
  { label: 'Selected', value: 'SELECTED' },
  { label: 'Rejected', value: 'REJECTED' },
];

function CandidateProfile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation(); // ✅ ADDED

  // ✅ ADDED (detect source)
  const from = location.state?.from || 'candidates';

  const [activeTab, setActiveTab] = useState('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [stageMenuPosition, setStageMenuPosition] = useState({ top: 0, right: 0 });

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // ---------------- FETCH BY ID ----------------
  const fetchCandidate = async () => {
    try {
      const res = await fetch(`${BASE_URL}/candidates/${id}`);

      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      setCandidate(data);
    } catch (err) {
      console.error(err);
      alert('Error loading candidate');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidate();
  }, [id]);

  // ---------------- UPDATE STAGE ----------------
  const updateStage = async (stage) => {
    try {
      console.log("Updating stage:", stage);

      const res = await fetch(
        `${BASE_URL}/candidates/${id}/stage?stage=${stage}`,
        {
          method: 'PATCH',
        }
      );

      if (!res.ok) {
        throw new Error('Stage update failed');
      }

      // Refresh data
      fetchCandidate();
      setShowStageDropdown(false);

    } catch (err) {
      console.error(err);
      alert('Error updating stage');
    }
  };

const resumeUrl = candidate?.resumeUrl;

  // ✅ ADDED BACK HANDLER
  const handleBack = () => {
    if (from === 'pipeline') {
      navigate('/pipeline');
    } else {
      navigate('/candidates');
    }
  };

  // ✅ ADDED LABEL HANDLER
  const getBackLabel = () => {
    return from === 'pipeline'
      ? '‹ Back to Pipeline'
      : '‹ Back to Candidates';
  };

  const handleStageButtonClick = (e) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuHeight = 240; // allow full list of stages
    const spaceBelow = window.innerHeight - rect.bottom;

    let top = rect.bottom + window.scrollY;
    const right = window.innerWidth - rect.right;

    if (spaceBelow < menuHeight) {
      top = rect.top + window.scrollY - menuHeight;
    }

    setStageMenuPosition({ top, right });
    setShowStageDropdown(prev => !prev);
  };

  // ---------------- HELPERS ----------------
  const getInitials = () => {
    return candidate?.firstName?.charAt(0) || '';
  };

  const formatStage = (stage) => {
    switch (stage) {
      case 'TECH_INTERVIEW': return 'Tech Interview';
      case 'HR_INTERVIEW': return 'HR Interview';
      case 'SCREENING': return 'Screening';
      case 'APPLIED': return 'Applied';
      case 'SELECTED': return 'Selected';
      case 'REJECTED': return 'Rejected';
      default: return stage;
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toDateString();
  };

  // ---------------- LOADING ----------------
  if (loading) {
    return (
      <div className="profile-main">
        <Loader label="Loading candidate..." />
      </div>
    );
  }

  if (!candidate) {
    return <div className="profile-main">Candidate not found</div>;
  }

  // ---------------- UI ----------------
  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />

      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} />

        <main className="profile-main">
          <div className="profile-breadcrumb">
            
            {/* ✅ UPDATED BACK BUTTON */}
            <button className="back-btn" onClick={handleBack}>
              {getBackLabel()}
            </button>

            <h2 className="profile-page-title">Candidate Profile</h2>

            <div className="profile-actions" style={{ position: 'relative' }}>
              
              {/* STAGE DROPDOWN BUTTON */}
              <button
                className="btn-more-stage"
                onClick={handleStageButtonClick}
              >
                More Stage ▾
              </button>

              {/* DROPDOWN */}
              {showStageDropdown && (
                <div
                  className="dropdown-menu"
                  style={{ top: `${stageMenuPosition.top}px`, right: `${stageMenuPosition.right}px`, position: 'fixed' }}
                >
                  <div className="dropdown-header">
                    <span>Select Stage</span>
                    <button
                      className="dropdown-close"
                      onClick={() => setShowStageDropdown(false)}
                    >
                      ✖
                    </button>
                  </div>

                  {stages.map((s) => (
                    <div
                      key={s.value}
                      className="dropdown-item"
                      onClick={() => updateStage(s.value)}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* HERO */}
          <div className="profile-hero">
            <div className="profile-hero-left">
              <div className="profile-big-avatar">{getInitials()}</div>

              <div className="profile-hero-info">
                <h2 className="profile-name">{candidate.firstName} {candidate.lastName}</h2>
                <p className="profile-contact">
                  {candidate.email} · {candidate.phone}
                </p>
                <p className="profile-role-tag">{candidate.department}</p>
              </div>
            </div>

            <div className="profile-ai-score">
              <p className="ai-score-label">AI Match Score</p>
              <p className="ai-score-value">--<span>/100</span></p>
            </div>
          </div>

          {/* META */}
          <div className="profile-meta">
            <div className="meta-item">
              <p className="meta-label">Current Stage</p>
              <span className="stage-badge-screened">
                {formatStage(candidate.currentStage)}
              </span>
            </div>

            <div className="meta-item">
              <p className="meta-label">Applied On</p>
              <p className="meta-value">
                {formatDate(candidate.createdAt)}
              </p>
            </div>

            <div className="meta-item">
              <p className="meta-label">Location</p>
              <p className="meta-value">{candidate.location}</p>
            </div>
          </div>

          {/* TABS */}
          <div className="profile-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="profile-content-grid">

              {/* SKILLS */}
              <div className="profile-section-card">
                <h4>Skills</h4>
                <div className="skills-wrap">
                  {candidate.skills?.split(',').map((s) => (
                    <span key={s} className="skill-tag">{s.trim()}</span>
                  ))}
                </div>

                <h4 className="section-subtitle">Experience Summary</h4>
                <p className="exp-text">
                  {candidate.yearsOfExperience} years experience in {candidate.department}
                </p>
              </div>

              {/* AI */}
              <div className="profile-section-card">
                <h4>AI Analysis</h4>
                <ul className="ai-analysis-list">
                  <li>Skills match analysis pending</li>
                  <li>Resume parsing pending</li>
                </ul>
                <div className="ai-recommendation">
                  <span>⭐</span>
                  <span>Recommendation: Evaluate further</span>
                </div>
              </div>

              {/* RESUME */}
{/* RESUME */}
<div className="profile-section-card resume-card">
  <h4>Resume Preview</h4>

  {candidate?.resumeUrl ? (
    <>
      <iframe
        src={`https://docs.google.com/gview?url=${encodeURIComponent(candidate?.resumeUrl)}&embedded=true`}
        width="100%"
        height="300px"
        style={{
          border: "none",
          borderRadius: "12px",
          overflow: "hidden"
        }}
        title="Resume Preview"
      />

      <div style={{ marginTop: "10px" }}>
        <a
          href={`https://docs.google.com/gview?url=${encodeURIComponent(candidate.resumeUrl)}&embedded=true`}
          target="_blank"
          rel="noreferrer"
          style={{ marginRight: "15px" }}
        >
          👁 View Full
        </a>

        <a href={candidate.resumeUrl} download>
          ⬇ Download
        </a>
      </div>
    </>
  ) : (
    <div className="resume-preview">
      <span className="pdf-icon">📄</span>
      <p>No Resume Uploaded</p>
    </div>
  )}
</div>

            </div>
          )}

          {/* OTHER TABS */}
          {activeTab !== 'Overview' && (
            <div className="tab-placeholder">
              <p>Content for <strong>{activeTab}</strong> tab coming soon.</p>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default CandidateProfile;