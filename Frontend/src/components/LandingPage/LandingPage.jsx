import { useNavigate } from 'react-router-dom';
import logo from '../../assets/images/Logo1.png';
import './LandingPage.css';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-wrapper">

      <header className="landing-header">
        <div className="landing-logo">
          <img src={logo} alt="Hein+Fricke Logo" className="logo-img" />
        </div>
        <p className="landing-subtitle">HR and Recruitment Platform</p>
      </header>

      <main className="landing-main">
        <div className="login-buttons">
          <button
            className="btn-role btn-director"
            onClick={() => navigate('/login/director')}
          >
            Director Login
          </button>
          <button
            className="btn-role btn-hr"
            onClick={() => navigate('/login/hr')}
          >
            HR Login
          </button>
          <button
            className="btn-role btn-manager"
            onClick={() => navigate('/login/manager')}
          >
            Manager Login
          </button>
        </div>

        <div className="welcome-banner">
          <p>Welcome To AI-powered Recruitment Platform</p>
        </div>

     
      </main>

      <footer className="landing-footer" onClick={() => navigate('/login/user')} role="button">
        <p>AI_HACKATHON_2026</p>
      </footer>

    </div>
  );
}

export default LandingPage;