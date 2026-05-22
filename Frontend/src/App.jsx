import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage/LandingPage';
import LoginPage from './components/LoginPage/LoginPage';
import OTPPage from './components/OTPPage/OTPPage';
import Dashboard from './components/Dashboard/Dashboard';
import Candidates from './components/Candidates/Candidates';
import CandidateProfile from './components/CandidateProfile/CandidateProfile';
import AIAssistant from './components/AIAssistant/AIAssistant';
import Pipeline from './components/Pipeline/Pipeline';
import Jobs from './components/Jobs/Jobs';
import Reports from './components/Reports/Reports';
import Settings from './components/Settings/Settings';
import NeonChromaInspect from './components/NeonChromaInspect/NeonChromaInspect';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NeonChromaInspect />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/login/:role" element={<LoginPage />} />
        <Route path="/otp" element={<OTPPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/candidates/:id" element={<CandidateProfile />} />
        <Route path="/ai-assistant" element={<AIAssistant />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
