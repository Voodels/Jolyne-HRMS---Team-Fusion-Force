import { useState, useEffect } from "react";
import logo from '../../assets/images/Logo2.png';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import { getDashboardData } from '../../api/dashboardApi';
import './Dashboard.css';

const defaultPipelineStages = [
  { label: 'Applied', count: 0, color: '#7c3aed', width: '100%' },
  { label: 'Screening', count: 0, color: '#3b82f6', width: '70%' },
  { label: 'Technical Review', count: 0, color: '#22c55e', width: '50%' },
  { label: 'HR Interview', count: 0, color: '#f59e0b', width: '32%' },
  { label: 'Selected', count: 0, color: '#10b981', width: '22%' },
];

const defaultChartData = [];

function SparkLine({ data }) {
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const w = 320;
  const h = 120;
  const pad = 20;
  const xStep = (w - pad * 2) / (data.length - 1);

  const points = data.map((d, i) => {
    const x = pad + i * xStep;
    const y = h - pad - ((d.value - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  });

  const area = `M ${points[0]} ${points.slice(1).map((p) => `L ${p}`).join(' ')} L ${pad + (data.length - 1) * xStep},${h - pad} L ${pad},${h - pad} Z`;
  const line = `M ${points[0]} ${points.slice(1).map((p) => `L ${p}`).join(' ')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline-svg">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6C47FF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6C47FF" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaGrad)" />
      <path d={line} fill="none" stroke="#6C47FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={pad + i * xStep}
          cy={h - pad - ((d.value - min) / (max - min || 1)) * (h - pad * 2)}
          r="4"
          fill="white"
          stroke="#6C47FF"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [summary, setSummary] = useState(null);
  const [pipelineStages, setPipelineStages] = useState(defaultPipelineStages);
  const [chartData, setChartData] = useState(defaultChartData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await getDashboardData(30);
        setSummary(data.summary);
        setPipelineStages(data.pipelineStages || defaultPipelineStages);
        setChartData(data.chartData || []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
        setError('Unable to load dashboard information.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const stats = [
    {
      label: 'Total Candidates',
      value: summary ? summary.totalCandidates : '0',
      icon: '👥',
      sub: '↑ 12% vs last week',
      subColor: '#22c55e',
      bg: '#ede9ff',
      iconColor: '#7c3aed',
    },
    {
      label: 'Active Jobs',
      value: summary ? summary.activeJobs : '0',
      icon: '💼',
      sub: '6 Closing soon',
      subColor: '#6b7280',
      bg: '#e0f2fe',
      iconColor: '#0ea5e9',
    },
    {
      label: 'Selected',
      value: summary ? summary.selectedCandidates : '0',
      icon: '✅',
      sub: 'This Month',
      subColor: '#6b7280',
      bg: '#dcfce7',
      iconColor: '#16a34a',
    },
    {
      label: 'In Progress',
      value: summary ? summary.inProgressCandidates : '0',
      icon: '⏳',
      sub: 'Across all progress',
      subColor: '#6b7280',
      bg: '#fef3c7',
      iconColor: '#d97706',
    },
  ];

  const chartSeries = chartData.length > 0 ? chartData : [];

  const stageColors = {
    Applied: '#7c3aed',
    Screening: '#3b82f6',
    'Technical Review': '#22c55e',
    'HR Interview': '#f59e0b',
    Selected: '#10b981',
  };

  const maxPipelineCount = Math.max(...pipelineStages.map((stage) => stage.count), 1);
  const pipelineStagesDisplay = pipelineStages.map((stage) => ({
    ...stage,
    color: stageColors[stage.label] || '#6b7280',
    width: `${Math.max(14, Math.round((stage.count / maxPipelineCount) * 100))}%`,
  }));

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} />
      <div className={`app-content ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <TopBar toggleSidebar={toggleSidebar} />
        <main className="dashboard-main">
          <div className="dashboard-welcome-row">
            <div>
              <h1 className="dashboard-welcome-title">Welcome to H+F</h1>
              <p className="dashboard-welcome-sub">HR and Recruitment Platform</p>
            </div>
            <div className="dashboard-logo-text">
              <img src={logo} alt="Hein+Fricke Logo" className="logo-img" />
            </div>
          </div>

          {error && <div className="dashboard-error">{error}</div>}
          {isLoading ? (
            <div className="dashboard-loading">Loading dashboard data...</div>
          ) : (
            <>
              <div className="stats-grid">
                {stats.map((s) => (
                  <div className="stat-card" key={s.label} style={{ background: s.bg }}>
                    <div className="stat-icon" style={{ color: s.iconColor }}>{s.icon}</div>
                    <div className="stat-info">
                      <p className="stat-label">{s.label}</p>
                      <p className="stat-value">{s.value}</p>
                      <p className="stat-sub" style={{ color: s.subColor }}>{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="dashboard-bottom">
            <div className="pipeline-card">
              <h3 className="card-title">Pipeline Overview</h3>
              <div className="funnel-container">
                {pipelineStagesDisplay.map((stage) => (
                  <div className="funnel-row" key={stage.label}>
                    <div className="funnel-bar-wrap">
                      <div
                        className="funnel-bar"
                        style={{
                          width: stage.width,
                          background: stage.color,
                        }}
                      />
                    </div>
                    <div className="funnel-label">
                      <span>{stage.label}</span>
                      <span className="funnel-count">{stage.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3 className="card-title">Candidates Added</h3>
                <select className="chart-filter">
                  <option>Last 30 Days</option>
                  <option>Last 7 Days</option>
                  <option>Last 3 Months</option>
                </select>
              </div>
              <div className="chart-wrap">
                <SparkLine data={chartSeries} />
                <div className="chart-x-labels">
                  {chartSeries.map((d) => (
                    <span key={d.date}>{d.date}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
