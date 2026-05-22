import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const navItems = [
  { label: 'Welcome', icon: '⌂', path: '/home' },
  { label: 'Dashboard', icon: '⊞', path: '/dashboard' },
  { label: 'Candidates', icon: '👤', path: '/candidates' },
  { label: 'Jobs', icon: '💼', path: '/jobs' },
  { label: 'Pipeline', icon: '≡', path: '/pipeline' },
  { label: 'AI Assistant', icon: '✦', path: '/ai-assistant' },
  { label: 'Reports', icon: '📊', path: '/reports' },
  { label: 'Settings', icon: '⚙', path: '/settings' },
];

function Sidebar({ isOpen }) {
  return (
    <div className={`sidebar ${isOpen ? "open" : "closed"}`}>
      {/* sidebar content */}
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">👥</span>
        <span className="sidebar-brand-name">SmartHire AI</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">RK</div>
        <div className="sidebar-user-info">
          <p className="sidebar-user-name">Minal Agrawal</p>
          <p className="sidebar-user-role">Recruiter</p>
        </div>
      </div>
    </aside>
    </div>
  );
}

export default Sidebar;
