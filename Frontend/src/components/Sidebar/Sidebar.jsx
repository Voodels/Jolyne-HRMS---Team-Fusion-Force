import { NavLink } from 'react-router-dom';
import { getAuthSession } from '../../api/authApi';
import { loadAppPermissions } from '../../api/permissionApi';
import './Sidebar.css';

const navItems = [
  // { label: 'Welcome', icon: '⌂', path: '/home' },
  { label: 'Dashboard', icon: '◫', path: '/dashboard' },
  { label: 'Candidates', icon: '◉', path: '/candidates' },
  { label: 'Jobs', icon: '▣', path: '/jobs' },
  { label: 'Pipeline', icon: '≣', path: '/pipeline' },
  { label: 'AI Assistant', icon: '✦', path: '/ai-assistant' },
  // { label: 'Reports', icon: '◨', path: '/reports' },
  { label: 'Settings', icon: '⚙', path: '/settings' },
];

function Sidebar({ isOpen }) {
  const session = getAuthSession();
  const permissions = loadAppPermissions();
  const userName = session?.name || session?.email || 'Guest';
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const visibleNavItems = navItems.filter((item) => {
    if (item.path === '/ai-assistant' && !permissions.allowAIService) {
      return false;
    }
    return true;
  });

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">👥</span>
          <span className="sidebar-brand-name">SmartHire AI</span>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => (
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
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{userName}</p>
            <p className="sidebar-user-role">{session?.role || 'Guest'}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default Sidebar;
