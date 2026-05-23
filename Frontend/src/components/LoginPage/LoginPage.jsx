import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import logo from '../../assets/images/Logo1.png';
import { login, setAuthSession } from '../../api/authApi';
import './LoginPage.css';

function LoginPage() {
  const { role } = useParams();
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', captcha: '' });
  const [error, setError] = useState('');
  const [captchaValue] = useState(Math.random().toString(36).substring(2, 8).toUpperCase());

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (form.captcha.trim().toUpperCase() !== captchaValue) {
      setError('Captcha value does not match.');
      return;
    }

    try {
      const data = await login({ email: form.email, password: form.password });
      if (role && data.role && data.role.toLowerCase() !== role.toLowerCase()) {
        setError(`This account is a ${data.role} account. Please use the ${data.role} login portal or select the correct role from the landing page.`);
        return;
      }

      setAuthSession({
        id: data.id,
        name: data.name,
        email: data.email,
        password: form.password,
        role: data.role,
        token: data.token,
      });
      navigate('/otp');
    } catch (err) {
      setError(err.message || 'Login failed.');
    }
  };

  // const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

  return (
    <div className="login-wrapper">
      <header className="login-header">
        <div className="landing-logo">
          <img src={logo} alt="Hein+Fricke Logo" className="logo-img" />
        </div>
        <p className="login-subtitle">HR and Recruitment Platform</p>
      </header>

      <main className="login-main">
        <div className="login-card">
          <h2 className="login-title">Sign in</h2>
          <p className="login-role-label">{roleLabel} Portal</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email <span className="required">*</span></label>
              <input
                type="email"
                name="email"
                placeholder="Enter Email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Password <span className="required">*</span></label>
              <input
                type="password"
                name="password"
                placeholder="Enter Password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Verify Captcha <span className="required">*</span></label>
              <div className="captcha-box">{captchaValue}</div>
              <input
                type="text"
                name="captcha"
                placeholder="Enter Captcha"
                value={form.captcha}
                onChange={handleChange}
                required
              />
            </div>

            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="btn-login">Login</button>
          </form>

          <a href="https://www.google.com" className="forgot-password">Forgot Password</a>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
