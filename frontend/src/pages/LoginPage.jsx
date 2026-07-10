import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user } = await login({ email, password });
      await refresh();
      navigate(user.nickname ? '/' : '/nickname');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="wordmark"><b>Zone</b>mate</div>
        <h1>로그인</h1>

        <div className="oauth-buttons">
          <a className="btn-oauth btn-kakao" href="/api/auth/kakao">카카오로 시작하기</a>
          <a className="btn-oauth btn-google" href="/api/auth/google">구글로 시작하기</a>
        </div>

        <div className="auth-divider"><span>또는</span></div>

        <form onSubmit={handleSubmit} className="task-input">
          <label className="field-label" htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="field-label" htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="auth-switch">계정이 없으신가요? <Link to="/signup">이메일로 가입하기</Link></p>
      </div>
    </div>
  );
}
