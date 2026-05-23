import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/images/Logo1.png';
import { getAuthSession, verifyOtp } from '../../api/authApi';
import './OTPPage.css';

function OTPPage() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const session = getAuthSession();

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');

    if (!session?.email) {
      setError('No authenticated session found. Please login again.');
      return;
    }

    try {
      await verifyOtp({ email: session.email, otp });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'OTP verification failed.');
    }
  };

  return (
    <div className="otp-wrapper">
      <header className="otp-header">
        <div className="landing-logo">
          <img src={logo} alt="Hein+Fricke Logo" className="logo-img" />
        </div>
        <p className="otp-subtitle">HR and Recruitment Platform</p>
      </header>

      <main className="otp-main">
        <div className="otp-card">
          <h2 className="otp-title">Sign in</h2>

          <form onSubmit={handleVerify} className="otp-form">
            <div className="form-group">
              <label>OTP <span className="required">*</span></label>
              <input
                type="text"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </div>

            {error && <p className="otp-error">{error}</p>}
            <button type="submit" className="btn-verify">Verify</button>
          </form>

          <p className="otp-note">
            OTP sent to {session?.email || 'your registered email'}. Please check your inbox.
          </p>
        </div>
      </main>
    </div>
  );
}

export default OTPPage;
