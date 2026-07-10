import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendVerificationCode, verifyEmailCode } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function SignupPage() {
  const [step, setStep] = useState('form'); // 'form' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleSendCode(e) {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 달라요');
      return;
    }
    setLoading(true);
    try {
      await sendVerificationCode({ email, password, passwordConfirm });
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyEmailCode({ email, code });
      await refresh();
      navigate('/nickname');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="wordmark"><b>FOCUS</b>·LOG</div>
        <h1>이메일로 가입하기</h1>

        {step === 'form' && (
          <form onSubmit={handleSendCode} className="task-input">
            <label className="field-label" htmlFor="signup-email">이메일</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="field-label" htmlFor="signup-password">비밀번호</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <label className="field-label" htmlFor="signup-password-confirm">비밀번호 확인</label>
            <input
              id="signup-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              minLength={8}
            />
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '전송 중...' : '이메일로 인증번호 받기'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerify} className="task-input">
            <p className="auth-hint">{email}로 인증번호를 보냈어요.</p>
            <label className="field-label" htmlFor="signup-code">인증번호</label>
            <input
              id="signup-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '확인 중...' : '가입 완료'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setStep('form')}>
              이메일 다시 입력
            </button>
          </form>
        )}

        <p className="auth-switch">이미 계정이 있으신가요? <Link to="/login">로그인</Link></p>
      </div>
    </div>
  );
}
