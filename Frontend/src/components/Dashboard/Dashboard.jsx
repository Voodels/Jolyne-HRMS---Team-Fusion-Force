<<<<<<< HEAD
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
=======
import { useEffect, useMemo, useState } from "react";
import logo from '../../assets/images/Logo2.png';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import Loader from '../Loader/Loader';
import './Dashboard.css';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const STAGE_CONFIG = [
  { key: 'APPLIED', label: 'Applied', color: '#7c3aed' },
  { key: 'SCREENING', label: 'Screening', color: '#3b82f6' },
  { key: 'TECH_INTERVIEW', label: 'Tech Interview', color: '#22c55e' },
  { key: 'HR_INTERVIEW', label: 'HR Interview', color: '#f59e0b' },
  { key: 'SELECTED', label: 'Selected', color: '#10b981' },
];
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd

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

function buildChartData(items, days, referenceDate) {
  const dayMap = new Map();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(referenceDate);
    day.setDate(referenceDate.getDate() - (days - 1 - i));
    const key = day.toISOString().slice(0, 10);
    dayMap.set(key, { date: day, value: 0 });
  }

  items.forEach((candidate) => {
    const date = candidate.createdAtDate;
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    const entry = dayMap.get(key);
    if (entry) {
      entry.value += 1;
    }
  });

  const entries = Array.from(dayMap.values());
  const bucketSize = Math.max(1, Math.floor(entries.length / 6));
  const buckets = [];
  for (let i = 0; i < entries.length; i += bucketSize) {
    const slice = entries.slice(i, i + bucketSize);
    const total = slice.reduce((sum, item) => sum + item.value, 0);
    const labelDate = slice[slice.length - 1]?.date || referenceDate;
    const label = labelDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    buckets.push({ date: label, value: total });
  }
  return buckets.slice(-6);
}

function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
<<<<<<< HEAD
  const [summary, setSummary] = useState(null);
  const [pipelineStages, setPipelineStages] = useState(defaultPipelineStages);
  const [chartData, setChartData] = useState(defaultChartData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
=======
  const [candidates, setCandidates] = useState([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartRange, setChartRange] = useState(30);
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  useEffect(() => {
<<<<<<< HEAD
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
=======
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${BASE_URL}/candidates?page=0&size=1000&sort=createdAt,desc`);
        if (!res.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : data.content || [];
        const total = Array.isArray(data) ? list.length : data.totalElements ?? list.length;

        setCandidates(list);
        setTotalCandidates(total);
      } catch (err) {
        console.error(err);
        setError('Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const computed = useMemo(() => {
    const now = new Date();
    const normalizeStage = (stage) => (stage || '').toUpperCase();
    const createdAtDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const candidatesWithDates = candidates.map((candidate) => ({
      ...candidate,
      createdAtDate: createdAtDate(candidate.createdAt),
    }));

    const last7 = candidatesWithDates.filter((c) => c.createdAtDate && now - c.createdAtDate <= 7 * 24 * 60 * 60 * 1000);
    const prev7 = candidatesWithDates.filter((c) => {
      if (!c.createdAtDate) return false;
      const diff = now - c.createdAtDate;
      return diff > 7 * 24 * 60 * 60 * 1000 && diff <= 14 * 24 * 60 * 60 * 1000;
    });

    const selectedCount = candidates.filter((c) => normalizeStage(c.currentStage) === 'SELECTED').length;
    const rejectedCount = candidates.filter((c) => normalizeStage(c.currentStage) === 'REJECTED').length;
    const inProgressCount = candidates.filter((c) => {
      const stage = normalizeStage(c.currentStage);
      return stage && stage !== 'SELECTED' && stage !== 'REJECTED';
    }).length;

    const uniqueRoles = new Set(
      candidates
        .map((c) => c.currentJobTitle || c.department)
        .filter((value) => value && String(value).trim().length > 0)
    );

    const last7Delta = last7.length - prev7.length;
    const last7Prefix = last7Delta >= 0 ? '↑' : '↓';
    const last7Color = last7Delta >= 0 ? '#22c55e' : '#ef4444';
    const last7Label = `${last7Prefix} ${Math.abs(last7Delta)} vs last week`;

    const stats = [
      {
        label: 'Total Candidates',
        value: totalCandidates,
        icon: '👥',
        sub: last7Label,
        subColor: last7Color,
        bg: '#ede9ff',
        iconColor: '#7c3aed',
      },
      {
        label: 'Active Jobs',
        value: uniqueRoles.size,
        icon: '💼',
        sub: `${uniqueRoles.size} roles in pipeline`,
        subColor: '#6b7280',
        bg: '#e0f2fe',
        iconColor: '#0ea5e9',
      },
      {
        label: 'Selected',
        value: selectedCount,
        icon: '✅',
        sub: 'Currently selected',
        subColor: '#6b7280',
        bg: '#dcfce7',
        iconColor: '#16a34a',
      },
      {
        label: 'In Progress',
        value: inProgressCount,
        icon: '⏳',
        sub: `${rejectedCount} rejected`,
        subColor: '#6b7280',
        bg: '#fef3c7',
        iconColor: '#d97706',
      },
    ];

    const stageCounts = STAGE_CONFIG.map((stage) => {
      const count = candidates.filter((c) => normalizeStage(c.currentStage) === stage.key).length;
      return { ...stage, count };
    });
    const maxStageCount = Math.max(1, ...stageCounts.map((stage) => stage.count));
    const pipelineStages = stageCounts.map((stage) => ({
      label: stage.label,
      count: stage.count,
      color: stage.color,
      width: `${Math.max(6, Math.round((stage.count / maxStageCount) * 100))}%`,
    }));

    const chart = buildChartData(candidatesWithDates, chartRange, now);

    return {
      stats,
      pipelineStages,
      chartData: chart,
    };
  }, [candidates, totalCandidates, chartRange]);
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd

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

<<<<<<< HEAD
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
=======
          <div className="stats-grid">
            {loading ? (
              <div className="dashboard-loader">
                <Loader label="Loading dashboard..." />
              </div>
            ) : (
              computed.stats.map((s) => (
                <div className="stat-card" key={s.label} style={{ background: s.bg }}>
                  <div className="stat-icon" style={{ color: s.iconColor }}>{s.icon}</div>
                  <div className="stat-info">
                    <p className="stat-label">{s.label}</p>
                    <p className="stat-value">{s.value}</p>
                    <p className="stat-sub" style={{ color: s.subColor }}>{s.sub}</p>
                  </div>
                </div>
              ))
            )}
          </div>
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd

          {error && (
            <div className="dashboard-error">
              {error}
            </div>
          )}

          <div className="dashboard-bottom">
            <div className="pipeline-card">
              <h3 className="card-title">Pipeline Overview</h3>
              <div className="funnel-container">
<<<<<<< HEAD
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
=======
                {loading ? (
                  <Loader label="Loading pipeline..." />
                ) : (
                  computed.pipelineStages.map((stage) => (
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
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3 className="card-title">Candidates Added</h3>
                <select
                  className="chart-filter"
                  value={chartRange}
                  onChange={(e) => setChartRange(Number(e.target.value))}
                >
                  <option value={30}>Last 30 Days</option>
                  <option value={7}>Last 7 Days</option>
                  <option value={90}>Last 3 Months</option>
                </select>
              </div>
              <div className="chart-wrap">
<<<<<<< HEAD
                <SparkLine data={chartSeries} />
                <div className="chart-x-labels">
                  {chartSeries.map((d) => (
                    <span key={d.date}>{d.date}</span>
                  ))}
                </div>
=======
                {loading ? (
                  <Loader label="Loading trend..." />
                ) : (
                  <>
                    <SparkLine data={computed.chartData} />
                    <div className="chart-x-labels">
                      {computed.chartData.map((d) => (
                        <span key={d.date}>{d.date}</span>
                      ))}
                    </div>
                  </>
                )}
>>>>>>> 5d6e6ebe81eeff2faafe3f5c617ce676ff91a4cd
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
