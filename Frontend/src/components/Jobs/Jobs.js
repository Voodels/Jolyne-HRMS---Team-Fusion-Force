import { useState, useEffect } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import AddJobModal from '../AddJobModal/AddJobModal'; // ✅ import modal
import { getJobs, createJob, deleteJob } from '../../api/jobApi';
import { getAuthSession } from '../../api/authApi';
import { DEFAULT_APP_PERMISSIONS, loadAppPermissions } from '../../api/permissionApi';
import './Jobs.css';

function Jobs() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobTitles, setJobTitles] = useState([]);
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState('All Managers');
  const [sortBy, setSortBy] = useState('Latest');
  const [managers, setManagers] = useState(['All Managers']);
  const [jobFilter, setJobFilter] = useState('All Jobs');

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [currentUser, setCurrentUser] = useState(null);
  const [appPermissions, setAppPermissions] = useState(DEFAULT_APP_PERMISSIONS);
  const canAddJob = appPermissions.allowAddJob;
  const canManageJob = (job) => {
    if (!currentUser?.role) return false;
    if (currentUser.role === 'hr' || currentUser.role === 'director') return true;
    if (currentUser.role === 'manager') return job.manager === currentUser.name;
    return false;
  };

  // ✅ NEW: modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  // ✅ Close dropdown
  useEffect(() => {
    const close = () => setActiveMenuId(null);
    const esc = (e) => e.key === 'Escape' && setActiveMenuId(null);

    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);

    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await getJobs();
        setJobs(data);
        
        // Extract unique managers and job titles from jobs data
        const uniqueManagers = ['All Managers', ...new Set(data.map(job => job.manager))];
        const uniqueTitles = [...new Set(data.map(job => job.title))];
        setManagers(uniqueManagers);
        setJobTitles(uniqueTitles);
      } catch (err) {
        console.error('Failed to load jobs', err);
        setError('Unable to load jobs.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  useEffect(() => {
    setCurrentUser(getAuthSession());
    setAppPermissions(loadAppPermissions());
  }, []);

  // ✅ Add Job FROM MODAL
  const handleAddJob = async (newJob) => {
    try {
      const created = await createJob({
        title: newJob.title,
        manager: newJob.manager,
        fileName: newJob.fileName,
        description: newJob.description || '',
      });
      setJobs(prev => [...prev, created]);
      
      // Update managers list if new manager is added
      setManagers(prev => {
        const newManagers = ['All Managers', ...new Set([...prev.slice(1), created.manager])];
        return newManagers;
      });
    } catch (err) {
      console.error('Failed to add job', err);
      setError('Unable to add job.');
    }
  };

  // ✅ Delete
  const handleDelete = async (id) => {
    try {
      await deleteJob(id);
      setJobs(prev => {
        const updatedJobs = prev.filter(j => j.id !== id);
        // Update managers list
        const uniqueManagers = ['All Managers', ...new Set(updatedJobs.map(job => job.manager))];
        setManagers(uniqueManagers);
        return updatedJobs;
      });
      setActiveMenuId(null);
    } catch (err) {
      console.error('Failed to delete job', err);
      setError('Unable to delete job.');
    }
  };

  const handleView = (job) => {
    console.log('View:', job);
  };

  const handleEdit = (job) => {
    console.log('Edit:', job);
  };

  const handleDownloadPDF = (fileName) => {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = `/jobs/${fileName}`; // Adjust path based on backend
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMenuClick = (e, jobId) => {
    e.stopPropagation();
    
    if (activeMenuId === jobId) {
      setActiveMenuId(null);
      return;
    }

    // Calculate menu position to avoid being hidden at bottom
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuHeight = 140; // Approximate menu height
    const spaceBelow = window.innerHeight - rect.bottom;
    
    let top = rect.bottom + window.scrollY;
    let right = window.innerWidth - rect.right;

    // If not enough space below, position above the button
    if (spaceBelow < menuHeight) {
      top = rect.top + window.scrollY - menuHeight;
    }

    setMenuPosition({ top, right });
    setActiveMenuId(jobId);
  };

  // ✅ FILTER
  let filtered = jobs.filter((j) =>
    (managerFilter === 'All Managers' || j.manager === managerFilter) &&
    (jobFilter === 'All Jobs' || j.title === jobFilter) &&
    (
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.manager.toLowerCase().includes(search.toLowerCase())
    )
  );

  // ✅ SORT
  if (sortBy === 'Name') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'Oldest') {
    filtered.sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));
  } else {
    filtered.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  }

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />

      <div className={`app-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <TopBar toggleSidebar={toggleSidebar} />

        <main className="jobs-main">

          {/* HEADER */}
          <div className="jobs-header">
            <h2 className="jobs-title">Jobs</h2>

            <div className="jobs-header-right">

              {/* FILTERS */}
              <div className="jobs-filters">
               <select className="filter-select" onChange={(e) => setJobFilter(e.target.value)}>
                  <option>All Jobs</option>
                  {jobTitles.map((title) => (
                    <option key={title}>{title}</option>
                  ))}
                </select>

                <select
                  className="filter-select"
                  value={managerFilter}
                  onChange={(e) => setManagerFilter(e.target.value)}
                >
                  {managers.map(manager => (
                    <option key={manager} value={manager}>{manager}</option>
                  ))}
                </select>

                <select
                  className="filter-select"
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="Latest">Sort: Latest</option>
                  <option value="Oldest">Sort: Oldest</option>
                  <option value="Name">Sort: Name</option>
                </select>
              </div>

              {/* SEARCH */}
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* ✅ UPDATED BUTTON */}
              {canAddJob && (
                <button
                  className="btn-add-job"
                  onClick={() => setIsModalOpen(true)}
                >
                  + Add Job
                </button>
              )}

            </div>
          </div>

          {error && <div className="jobs-error">{error}</div>}
          {isLoading ? (
            <div className="jobs-loading">Loading jobs...</div>
          ) : (
            <div className="jobs-table-wrap">
              <table className="jobs-table">
              <thead>
                <tr>
                  <th>Job Name</th>
                  <th>Manager</th>
                  <th>Last Updated</th>
                  <th>Job Description</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((job) => (
                  <tr key={job.id} className="job-row">
                    <td>{job.title}</td>
                    <td>{job.manager}</td>
                    <td>{job.lastUpdated}</td>

                    <td>
                      <span 
                        className="pdf-link" 
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleDownloadPDF(job.fileName)}
                        title="Click to download"
                      >
                        📄 {job.fileName}
                      </span>
                    </td>

                    {/* ACTION MENU */}
                    <td style={{ position: 'relative' }}>
                      <button
                        className="more-btn"
                        onClick={(e) => handleMenuClick(e, job.id)}
                      >
                         ⋮
                      </button>

                      {activeMenuId === job.id && (
                        <div
                          className="dropdown-menu"
                          style={{ top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="dropdown-header">
                            <span>Actions</span>
                            <button
                              className="dropdown-close"
                              onClick={() => setActiveMenuId(null)}
                            >
                              ✖
                            </button>
                          </div>

                          <div className="dropdown-item" onClick={() => handleView(job)}>
                            👁 View
                          </div>
                          {canManageJob(job) && (
                            <>
                              <div className="dropdown-item" onClick={() => handleEdit(job)}>
                                ✏ Edit
                              </div>
                              <div className="dropdown-item delete" onClick={() => handleDelete(job.id)}>
                                🗑 Delete
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* EMPTY */}
          {(!isLoading && filtered.length === 0) && (
            <p className="no-data">No jobs found</p>
          )}

        </main>
      </div>

      {/* ✅ ADD JOB MODAL */}
      <AddJobModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddJob}
        currentUser={currentUser}
      />

    </div>
  );
}

export default Jobs;